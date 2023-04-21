// Initialize an in-memory sqlite3 database
const fs = require("fs");
const readline = require("readline");

// Initialize a set to store the valid tokens
const validTokens = new Set();

/**
 * Read the CSV file and insert its contents into the database
 * @param {string} filePath - The path to the CSV file to read
 */
async function readCsv(db, filePath) {
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
      bulkInsertTransactions(db, transactions);
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
        bulkInsertTransactions(db, transactions);
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
 * Create a table storing transactions
 */
async function createTable(db) {
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
async function bulkInsertTransactions(db, transactions) {
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
 * Gets the balance of a given token up to a specified end date.
 * @async
 * @param {string} token - The token for which the balance is to be fetched.
 * @param {number} endDate - The Unix timestamp in seconds representing the end date up to which the balance is to be calculated.
 * @returns {Promise<number>} - The balance of the specified token.
 */
async function getBalance(db, token, endDate) {
  const stmt = db.prepare(`
    SELECT SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE -amount END) as balance
    FROM transactions
    WHERE token = ? AND timestamp <= ?
  `);
  const row = stmt.get(token, endDate);
  return row.balance || 0;
}

module.exports = {
  validTokens,
  readCsv,
  createTable,
  getBalance,
  bulkInsertTransactions,
};
