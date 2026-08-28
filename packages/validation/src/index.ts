import { z } from 'zod';

export const isoCurrencySchema = z.string().length(3).toUpperCase();
export const cuidSchema = z.string().min(10);
