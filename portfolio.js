const fs = require("fs");
const readline = require("readline");
const { createInterface } = require("readline");
const axios = require("axios");

const API_URL = "https://min-api.cryptocompare.com/data/price";

// Read the CSV file and parse its contents into an array of transactions
function readCsv(filePath) {
  const transactions = [];

  const fileStream = fs.createReadStream(filePath);

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  rl.on("line", (line) => {
    const [timestamp, transactionType, token, amount] = line.split(",");
    transactions.push({
      timestamp: parseInt(timestamp),
      type: transactionType,
      token,
      amount: parseFloat(amount),
    });
  });

  return new Promise((resolve, reject) => {
    rl.on("close", () => {
      resolve(transactions);
    });

    rl.on("error", (error) => {
      reject(error);
    });
  });
}

// Calculate the portfolio value for a given token
async function calculateTokenPortfolioValue(transactions, token, date) {
  const exchangeRate = await getExchangeRate(token);
  let balance = 0;

  for (const transaction of transactions) {
    if (transaction.token === token && transaction.timestamp <= date) {
      if (transaction.type === "DEPOSIT") {
        balance += transaction.amount;
      } else if (transaction.type === "WITHDRAWAL") {
        balance -= transaction.amount;
      }
    }
  }

  return balance * exchangeRate;
}

// Get the latest portfolio value for each token
async function getLatestPortfolioValue(transactions) {
  const tokens = new Set(transactions.map((transaction) => transaction.token));
  const portfolioValue = {};

  for (const token of tokens) {
    const exchangeRate = await getExchangeRate(token);
    let balance = 0;

    for (const transaction of transactions) {
      if (transaction.token === token) {
        if (transaction.type === "DEPOSIT") {
          balance += transaction.amount;
        } else if (transaction.type === "WITHDRAWAL") {
          balance -= transaction.amount;
        }
      }
    }

    portfolioValue[token] = balance * exchangeRate;
  }

  return portfolioValue;
}

// Get the exchange rate for a given token in USD
async function getExchangeRate(token) {
  const response = await axios.get(API_URL, {
    params: {
      fsym: token,
      tsyms: "USD",
    },
  });

  return response.data.USD;
}

// Parse command line arguments and call the appropriate function
async function main() {
  const [, , ...args] = process.argv;

  const transactions = await readCsv("./transactions.csv");

  if (args.length === 0) {
    const portfolioValue = await getLatestPortfolioValue(transactions);
    console.log(portfolioValue);
  } else if (args.length === 1) {
    const token = args[0];
    const portfolioValue = await calculateTokenPortfolioValue(
      transactions,
      token,
      Date.now() / 1000
    );
    console.log(`${token}: ${portfolioValue}`);
  } else if (args.length === 2) {
    const date = new Date(args[0]).getTime() / 1000;
    const token = args[1];
    const portfolioValue = await calculateTokenPortfolioValue(
      transactions,
      token,
      date
    );
    console.log(`${token} on ${args[0]}: ${portfolioValue}`);
  } else {
    console.log("Invalid arguments");
  }
}

main();
