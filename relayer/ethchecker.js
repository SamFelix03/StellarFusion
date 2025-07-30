const axios = require('axios');

const ALCHEMY_URL = "https://eth-sepolia.g.alchemy.com/v2/NMsHzNgJ7XUYtzNyFpEJ8yT4muQ_lkRF";
const escrowAddress = "0x821E049c0d103230BE6203f5ad9E9c2F7948A95B".toLowerCase();
const targetAddress = "0x7b79995e5f793a07bc00c21412e50ecae098e7f9".toLowerCase(); // ← Address to check
const targetAmount = 0.001;

async function fetchAndCheckTransactions() {
  try {
    const response = await axios.post(ALCHEMY_URL, {
      jsonrpc: "2.0",
      id: 1,
      method: "alchemy_getAssetTransfers",
      params: [{
        fromBlock: "0x0",
        toBlock: "latest",
        toAddress: escrowAddress,
        category: ["internal"], // Only internal txs
        withMetadata: true,
        excludeZeroValue: false,
        maxCount: "0x3e8"
      }]
    });

    const transfers = response.data.result.transfers;

    console.log(`Total Internal Transactions to Escrow: ${transfers.length}`);

    const matched = transfers.filter(tx => {
      const from = tx.from?.toLowerCase();
      const value = parseFloat(tx.value || 0);
      return from === targetAddress && value === targetAmount;
    });

    if (matched.length > 0) {
      console.log(`✅ Match found! ${matched.length} transaction(s) from ${targetAddress} with value ${targetAmount} ETH:`);
      matched.forEach((tx, i) => {
        console.log(`${i + 1}. Hash: ${tx.hash}`);
      });
    } else {
      console.log(`❌ No matching internal transactions found for address ${targetAddress} with value ${targetAmount} ETH.`);
    }

  } catch (error) {
    console.error("Error fetching transactions:", error.response?.data || error.message);
  }
}

fetchAndCheckTransactions();
