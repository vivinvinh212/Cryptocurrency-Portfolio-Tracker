const fs = require("fs");
const readline = require("readline");
const { createInterface } = require("readline");
const axios = require("axios");
const sqlite3 = require("better-sqlite3");

// Set the URL for the API to fetch exchange rates
const API_URL = "https://min-api.cryptocompare.com/data/price";

// Initialize a set to store the valid tokens
const validTokens = new Set();

// Initialize an in-memory sqlite3 database
const db = new sqlite3(":memory:");

/**
 * Create a table storing transactions
 */
async function createTable() {
  const stmt = db.prepare(`
    CREATE TABLE IF NOT EXISTS transactions (
      timestamp INTEGER,
      type TEXT,
      token TEXT,
      amount REAL
    )
  `);
  stmt.run();
}

/**
 * Bulk insert transactions into the transactions table
 * @param {array} transactions - An array of transactions to insert
 */
async function bulkInsertTransactions(transactions) {
  const insertStmt = db.prepare(`
    INSERT INTO transactions (timestamp, type, token, amount) VALUES (?, ?, ?, ?)
  `);
  const insertMany = db.transaction((transactions) => {
    for (const transaction of transactions) {
      validTokens.add(transaction[2]);
      insertStmt.run(transaction);
    }
  });
  insertMany(transactions);
  // console.log(`Bulk inserted ${transactions.length} transactions.`);
}

/**
 * Read the CSV file and insert its contents into the database
 * @param {string} filePath - The path to the CSV file to read
 */
async function readCsv(filePath) {
  const fileStream = fs.createReadStream(filePath);

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
    highWaterMark: 256 * 1024, // Increase the read buffer size to speed up streaming progress (Too high may make program run out of mem!)
  });

  let isFirstLine = true; // Track if the line being parsed is the first line
  let rowCount = 0; // Initialize row counter

  const BATCH_SIZE = 100000; // Set the batch size for bulk insert

  let transactions = []; // Initialize the array for holding the transactions

  rl.on("line", (line) => {
    if (isFirstLine) {
      isFirstLine = false;
      return; // Skip the first line
    }

    const [timestamp, transactionType, token, amount] = line.split(",");
    transactions.push([timestamp, transactionType, token, amount]);

    if (transactions.length >= BATCH_SIZE) {
      bulkInsertTransactions(transactions);
      transactions = []; // Reset the transactions array
    }

    rowCount++;

    // Log progress after every 1,000,000 rows
    // if (rowCount % 1000000 === 0) {
    //   console.log(`Processed ${rowCount} rows.`);
    // }
  });

  return new Promise((resolve, reject) => {
    rl.on("close", () => {
      // Insert any remaining transactions
      if (transactions.length > 0) {
        bulkInsertTransactions(transactions);
      }
      console.log(
        `Finish create database. Total transactions count: ${rowCount}`
      );
      resolve();
    });

    rl.on("error", (error) => {
      reject(error);
    });
  });
}

/**
 * Calculate the portfolio value of a specific token
 * @param {string} token - The token to calculate the value of
 */
async function calculateTokenPortfolioValue(token) {
  const latestDate = Math.floor(Date.now() / 1000);
  await calculatePortfolioValue(latestDate, token);
}

/**
 * Calculates and returns the portfolio value for all tokens or a specific token at a given date.
 * @async
 * @param {number} date - The Unix timestamp in seconds representing the date for which the portfolio value is to be calculated.
 * @param {string} [token=null] - The token for which the portfolio value is to be calculated. If not provided, calculates the portfolio value for all tokens.
 * @returns {Promise<void>}
 */
async function calculatePortfolioValue(date, token = null) {
  const tokensToFetch = token ? [token] : [...validTokens];
  for (const currentToken of tokensToFetch) {
    const balance = await getBalance(currentToken, date);
    const exchangeRate = await getExchangeRate(currentToken);
    const valueInUSD = balance * exchangeRate;

    const formattedUsd = valueInUSD.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
    const formattedAmount = balance.toLocaleString("en-US");
    console.log(
      `${currentToken}: ${formattedUsd} (${formattedAmount} ${currentToken})`
    );
  }
}

/**
 * Gets the balance of a given token up to a specified end date.
 * @async
 * @param {string} token - The token for which the balance is to be fetched.
 * @param {number} endDate - The Unix timestamp in seconds representing the end date up to which the balance is to be calculated.
 * @returns {Promise<number>} - The balance of the specified token.
 */
async function getBalance(token, endDate) {
  const stmt = db.prepare(`
    SELECT SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE -amount END) as balance
    FROM transactions
    WHERE token = ? AND timestamp <= ?
  `);
  const row = stmt.get(token, endDate);
  return row.balance || 0;
}

/**
 * Gets the exchange rate of a given token to USD.
 * @async
 * @param {string} token - The token for which the exchange rate is to be fetched.
 * @returns {Promise<number>} - The exchange rate of the specified token to USD.
 */
async function getExchangeRate(token) {
  const response = await axios.get(API_URL, {
    params: {
      fsym: token,
      tsyms: "USD",
    },
  });

  return response.data.USD;
}

/**
 * Checks if a given token is valid.
 * @param {string} token - The token to be checked.
 * @returns {boolean} - True if the token is valid, false otherwise.
 */
function checkValidToken(token) {
  return validTokens.has(token);
}

async function main() {
  console.log("\n----Welcome to crypto tracker service!----\n");
  console.log("Loading...");

  const startTime = Date.now(); // Record the start time

  // Create in-memory table and read csv file into database
  await createTable();
  await readCsv("./transactions.csv");

  const elapsedTime = Date.now() - startTime; // Calculate the elapsed time
  console.log(`Total time taken: ${elapsedTime / 1000} seconds`);
  console.log(
    `Tokens found in the portfolio: ${[...validTokens].join(", ")}\n`
  );

  // Log program usage and example
  console.log("Usage:");
  console.log("  <null>: return the latest portfolio value per token in USD");
  console.log(
    "  <Token>: return the latest portfolio value for that token in USD (Example: ETH)"
  );
  console.log(
    "  <Date>: return the portfolio value per token in USD on that date (format: YYYY-MM-DD) (Example: 2020-10-10)"
  );
  console.log(
    "  <Date> <Token>: return the portfolio value of that token in USD on that date (format: YYYY-MM-DD token) (Example: 2020-10-10 ETH)\n"
  );

  // Create input interface
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  /**
   * Asks for user input to execute commands or exit the program.
   * @async
   * @function prompt
   * @param {string} input - User input to execute commands or exit the program.
   * @returns {void}
   */
  async function prompt() {
    rl.question('Enter command or type "quit" to exit: \n', async (input) => {
      if (input.toLowerCase() === "quit") {
        rl.close();
        console.log("\n----Thank you for using the service!----");
        return;
      }

      const args = input.split(" ");
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

      if (args.length === 1) {
        if (dateRegex.test(args[0])) {
          const date = Math.floor(new Date(args[0]).getTime() / 1000);
          await calculatePortfolioValue(date);
        } else if (checkValidToken(args[0])) {
          await calculateTokenPortfolioValue(args[0]);
        } else if (args[0] === "") {
          await calculatePortfolioValue(Date.now());
        } else {
          console.log("Invalid arguments");
        }
      } else if (args.length === 2) {
        if (dateRegex.test(args[0]) && checkValidToken(args[1])) {
          const date = Math.floor(new Date(args[0]).getTime() / 1000);
          await calculatePortfolioValue(date, args[1]);
        } else {
          console.log("Invalid arguments");
        }
      }
      prompt();
    });
  }

  prompt();
}

main();
