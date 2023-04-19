const fs = require("fs");
const readline = require("readline");
const { createInterface } = require("readline");
const axios = require("axios");
const sqlite3 = require("sqlite3").verbose();

const API_URL = "https://min-api.cryptocompare.com/data/price";
const validTokens = new Set();
const db = new sqlite3.Database(":memory:");

// Create a table for transactions if it doesn't exist
db.run(
  `CREATE TABLE IF NOT EXISTS transactions (
    timestamp INTEGER,
    type TEXT,
    token TEXT,
    amount REAL
  )`
);

// Read the CSV file and insert its contents into the database
async function readCsv(filePath) {
  const fileStream = fs.createReadStream(filePath);

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let isFirstLine = true; // Track if the line being parsed is the first line
  let currentBatch = 0;

  rl.on("line", (line) => {
    if (isFirstLine) {
      isFirstLine = false;
      return; // Skip the first line
    }

    const [timestamp, transactionType, token, amount] = line.split(",");
    db.run(
      `INSERT INTO transactions (timestamp, type, token, amount) VALUES (?, ?, ?, ?)`,
      [timestamp, transactionType, token, amount],
      (error) => {
        if (error) {
          console.error(error.message);
        }
      }
    );

    // Commit the transaction after every 100000 inserts
    currentBatch++;
    if (currentBatch === 100000) {
      db.exec("COMMIT", (error) => {
        if (error) {
          console.error(error.message);
        } else {
          console.log("Transaction completed.");
        }
      });
      db.exec("BEGIN");
      currentBatch = 0;
    }
    validTokens.add(token);
  });

  return new Promise((resolve, reject) => {
    rl.on("close", () => {
      // Commit the final transaction
      db.exec("COMMIT", (error) => {
        if (error) {
          console.error(error.message);
          reject(error);
        } else {
          console.log("Finish create database");
          resolve();
        }
      });
    });

    rl.on("error", (error) => {
      reject(error);
    });
  });
}

async function getEarliestTimestamp() {
  const sql = `SELECT MIN(timestamp) as earliestTimestamp FROM transactions`;

  return new Promise((resolve, reject) => {
    db.get(sql, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row.earliestTimestamp);
    });
  });
}

async function calculateTokenPortfolioValue(token) {
  const latestDate = Math.floor(Date.now() / 1000);
  await calculatePortfolioValue(latestDate, token);
}

async function calculatePortfolioValue(date, token = null) {
  const tokensToFetch = token ? [token] : await getDistinctTokens();
  for (const currentToken of tokensToFetch) {
    const balance = await getBalance(currentToken, date);
    const exchangeRate = await getExchangeRate(currentToken);
    const valueInUSD = balance * exchangeRate;
    console.log(
      `${currentToken}: ${valueInUSD.toFixed(2)} USD (${balance.toFixed(
        2
      )} ${currentToken})`
    );
  }
}

async function getDistinctTokens() {
  return new Promise((resolve, reject) => {
    db.all("SELECT DISTINCT token FROM transactions", (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows.map((row) => row.token));
    });
  });
}

async function getBalance(token, endDate) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE -amount END) as balance
         FROM transactions
         WHERE token = ? AND timestamp <= ?`,
      [token, endDate],
      (error, row) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(row.balance || 0);
      }
    );
  });
}

async function getExchangeRate(token) {
  const response = await axios.get(API_URL, {
    params: {
      fsym: token,
      tsyms: "USD",
    },
  });

  return response.data.USD;
}
function checkValidToken(token) {
  if (validTokens.has(token)) {
    return true;
  }
  return false;
}

// Parse command line arguments and call the appropriate function
async function main() {
  await readCsv("./transactions.csv");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  async function prompt() {
    rl.question('Enter command or type "quit" to exit: ', async (input) => {
      if (input.toLowerCase() === "quit") {
        rl.close();
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
