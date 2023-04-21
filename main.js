const { validTokens, createTable, readCsv } = require("./database");
const {
  calculatePortfolioValue,
  calculateTokenPortfolioValue,
} = require("./calculate");
const sqlite3 = require("better-sqlite3");
const readline = require("readline");

async function main() {
  // Intialize in-memory better-sqlite3 db
  const db = new sqlite3(":memory:");
  // db.pragma("journal_mode = WAL");

  console.log("\n----Welcome to crypto tracker service!----\n");
  console.log("Loading...");

  const startTime = Date.now(); // Record the start time

  // Create in-memory table and read csv file into database
  await createTable(db);
  await readCsv(db, "./transactions.csv");

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
  const rl = readline.createInterface({
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
    rl.question('\nEnter command or type "quit" to exit: \n', async (input) => {
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
          await calculatePortfolioValue(db, date);
        } else if (validTokens.has(args[0])) {
          await calculateTokenPortfolioValue(db, args[0]);
        } else if (args[0] === "") {
          await calculatePortfolioValue(db, Date.now());
        } else {
          console.log("Invalid arguments");
        }
      } else if (args.length === 2) {
        if (dateRegex.test(args[0]) && validTokens.has(args[1])) {
          const date = Math.floor(new Date(args[0]).getTime() / 1000);
          await calculatePortfolioValue(db, date, args[1]);
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
