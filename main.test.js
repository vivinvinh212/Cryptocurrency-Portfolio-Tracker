const {
  createTable,
  bulkInsertTransactions,
  getBalance,
} = require("./database.js");
const sqlite3 = require("better-sqlite3");

// Example test suite for createTable function
describe("createTable", () => {
  it("should create a transactions table", async () => {
    // Create an in-memory test database
    const testDb = new sqlite3(":memory:");

    // Call the createTable function and verify that it created the table
    await createTable(testDb);
    const tableExists = testDb
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'`
      )
      .get();
    expect(tableExists).toBeTruthy();
  });
});

// Example test suite for bulkInsertTransactions function
describe("bulkInsertTransactions", () => {
  it("should insert multiple transactions into the transactions table", async () => {
    // Create an in-memory test database
    const testDb = new sqlite3(":memory:");
    await createTable(testDb);

    // Define some test transactions to insert
    const testTransactions = [
      [1234567890, "DEPOSIT", "ETH", 1.0],
      [1234567891, "WITHDRAW", "BTC", 0.5],
      [1234567892, "DEPOSIT", "ETH", 0.25],
    ];

    // Call the bulkInsertTransactions function and verify that the transactions were inserted
    await bulkInsertTransactions(testDb, testTransactions);
    const transactionCount = testDb
      .prepare("SELECT COUNT(*) as count FROM transactions")
      .get().count;
    expect(transactionCount).toBe(testTransactions.length);
  });
});

// Example test suite for getBalance function
describe("getBalance", () => {
  it("should return the correct balance for a token and end date", async () => {
    // Create an in-memory test database and insert some test transactions
    const testDb = new sqlite3(":memory:");
    await createTable(testDb);

    const testTransactions = [
      [1234567890, "DEPOSIT", "ETH", 1.0],
      [1234567891, "WITHDRAW", "BTC", 0.5],
      [1234567892, "DEPOSIT", "ETH", 0.25],
    ];
    await bulkInsertTransactions(testDb, testTransactions);

    // Call the getBalance function and verify that it returns the correct balance
    const testToken = "ETH";
    const testEndDate = 1234567891;
    const testBalance = await getBalance(testDb, testToken, testEndDate);
    expect(testBalance).toBe(1.0);
  });
});
