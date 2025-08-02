import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const env = {
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o',
};
