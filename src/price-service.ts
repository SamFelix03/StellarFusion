import axios from 'axios';

interface PriceData {
  [key: string]: {
    usd: number;
  };
}

interface TokenPrice {
  symbol: string;
  price: number;
}

// CoinGecko token ID mappings
const TOKEN_ID_MAP: { [symbol: string]: string } = {
  'ETH': 'ethereum',
  'BNB': 'binancecoin',
  'WETH': 'ethereum',
  'WBNB': 'binancecoin',
  'USDC': 'usd-coin',
  'USDT': 'tether'
};

export class PriceService {
  private static readonly BASE_URL = 'https://api.coingecko.com/api/v3';
  
  /**
   * Fetch current prices for multiple tokens
   */
  static async getTokenPrices(symbols: string[]): Promise<TokenPrice[]> {
    // TESTING MODE: Return 1:1 prices instead of calling CoinGecko
    console.log("📊 Using 1:1 testing prices (CoinGecko disabled)");
    
    const prices: TokenPrice[] = [];
    for (const symbol of symbols) {
      prices.push({
        symbol: symbol.toUpperCase(),
        price: 1.0 // 1:1 price for testing
      });
    }
    return prices;

    /* COMMENTED OUT FOR TESTING - UNCOMMENT FOR PRODUCTION
    try {
      const tokenIds = symbols.map(symbol => TOKEN_ID_MAP[symbol.toUpperCase()]).filter(Boolean);
      
      if (tokenIds.length === 0) {
        throw new Error('No valid token symbols provided');
      }
      
      const response = await axios.get<PriceData>(
        `${this.BASE_URL}/simple/price`,
        {
          params: {
            ids: tokenIds.join(','),
            vs_currencies: 'usd'
          }
        }
      );
      
      const prices: TokenPrice[] = [];
      
      for (const symbol of symbols) {
        const tokenId = TOKEN_ID_MAP[symbol.toUpperCase()];
        if (tokenId && response.data[tokenId]) {
          prices.push({
            symbol: symbol.toUpperCase(),
            price: response.data[tokenId].usd
          });
        }
      }
      
      return prices;
    } catch (error) {
      console.error('Error fetching token prices:', error);
      throw new Error('Failed to fetch token prices from CoinGecko');
    }
    */
  }
  
  /**
   * Calculate destination amount based on source amount and token prices
   */
  static async calculateDestinationAmount(
    sourceSymbol: string,
    destinationSymbol: string,
    sourceAmount: number
  ): Promise<number> {
    // TESTING MODE: Return 1:1 conversion
    console.log(`💱 Testing mode: 1:1 conversion - ${sourceAmount} ${sourceSymbol} = ${sourceAmount} ${destinationSymbol}`);
    return sourceAmount;

    /* COMMENTED OUT FOR TESTING - UNCOMMENT FOR PRODUCTION
    try {
      const prices = await this.getTokenPrices([sourceSymbol, destinationSymbol]);
      
      const sourcePrice = prices.find(p => p.symbol === sourceSymbol.toUpperCase())?.price;
      const destPrice = prices.find(p => p.symbol === destinationSymbol.toUpperCase())?.price;
      
      if (!sourcePrice || !destPrice) {
        throw new Error('Could not find prices for one or both tokens');
      }
      
      // Calculate destination amount: (sourceAmount * sourcePrice) / destPrice
      const destinationAmount = (sourceAmount * sourcePrice) / destPrice;
      
      return destinationAmount;
    } catch (error) {
      console.error('Error calculating destination amount:', error);
      throw error;
    }
    */
  }
  
  /**
   * Get a single token price
   */
  static async getTokenPrice(symbol: string): Promise<number> {
    // TESTING MODE: Return fixed price of $1
    return 1.0;

    /* COMMENTED OUT FOR TESTING - UNCOMMENT FOR PRODUCTION
    const prices = await this.getTokenPrices([symbol]);
    const price = prices.find(p => p.symbol === symbol.toUpperCase())?.price;
    
    if (!price) {
      throw new Error(`Could not find price for token: ${symbol}`);
    }
    
    return price;
    */
  }
} 