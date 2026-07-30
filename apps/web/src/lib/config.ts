export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  algorandNetwork: process.env.NEXT_PUBLIC_ALGORAND_NETWORK ?? 'testnet',
} as const;
