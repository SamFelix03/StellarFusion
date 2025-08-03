export const chainsConfig = {
  "sepolia": {
    "name": "Sepolia Testnet",
    "chainId": 11155111,
    "rpcUrl": "https://eth-sepolia.g.alchemy.com/v2/NMsHzNgJ7XUYtzNyFpEJ8yT4muQ_lkRF",
    "nativeCurrency": {
      "name": "Ethereum",
      "symbol": "ETH",
      "decimals": 18
    },
    "factoryAddress": "0x4F25B17649F0A056138E251487c27A22D793DBA7",
    "lopAddress": "0x13F4118A0C9AA013eeB078f03318aeea84469cDD",
    "resolverAddress": "0xB555d9121151B2e3f6E383b896E7169FebA20578",
    "tokens": {
      "ETH": {
        "name": "Ethereum",
        "symbol": "ETH",
        "address": "0x0000000000000000000000000000000000000000",
        "decimals": 18,
        "isNative": true
      },
      "WETH": {
        "name": "Wrapped Ethereum",
        "symbol": "WETH",
        "address": "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9",
        "decimals": 18,
        "isNative": false
      },
      "USDC": {
        "name": "USD Coin",
        "symbol": "USDC",
        "address": "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
        "decimals": 6,
        "isNative": false
      }
    }
  },
  "stellar-testnet": {
    "name": "Stellar Testnet",
    "chainId": "testnet",
    "rpcUrl": "https://soroban-testnet.stellar.org:443",
    "nativeCurrency": {
      "name": "Stellar Lumens",
      "symbol": "XLM",
      "decimals": 7
    },
    "factoryAddress": "CD3TAVDMTRSPT475FP2APSC3MRQFOHVKEMJYPUGGQRP3KS4B5UBPCFH6",
    "lopAddress": "CCFLX4NZH4MVTQ5DYO74LEB3S7U2GO6OH3VP4NPYF4CXXSXR4GPRXEXV",
    "resolverAddress": "CAQMJITFSUJCIHCUSJCYAH7D76FJINNG32KPNRSIS7NXXLVIGVD4OKE2",
    "tokens": {
      "XLM": {
        "name": "Stellar Lumens",
        "symbol": "XLM",
        "address": "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        "decimals": 7,
        "isNative": true
      },
      "USDC": {
        "name": "USD Coin",
        "symbol": "USDC",
        "address": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
        "decimals": 6,
        "isNative": false
      }
    },
    "isStellar": true
  }
}