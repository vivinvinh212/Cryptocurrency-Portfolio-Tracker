const axios = require("axios");
const { getBalance, validTokens } = require("./database");

const API_URL = "https://min-api.cryptocompare.com/data/price";

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
 * Calculate the portfolio value of a specific token
 * @param {string} token - The token to calculate the value of
 */
async function calculateTokenPortfolioValue(db, token) {
  const latestDate = Math.floor(Date.now() / 1000);
  await calculatePortfolioValue(db, latestDate, token);
}

/**
 * Calculates and returns the portfolio value for all tokens or a specific token at a given date.
 * @async
 * @param {number} date - The Unix timestamp in seconds representing the date for which the portfolio value is to be calculated.
 * @param {string} [token=null] - The token for which the portfolio value is to be calculated. If not provided, calculates the portfolio value for all tokens.
 * @returns {Promise<void>}
 */
async function calculatePortfolioValue(db, date, token = null) {
  const tokensToFetch = token ? [token] : [...validTokens];
  for (const currentToken of tokensToFetch) {
    const balance = await getBalance(db, currentToken, date);
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

module.exports = {
  getExchangeRate,
  calculatePortfolioValue,
  calculateTokenPortfolioValue,
};
