import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import Tesseract from 'tesseract.js';
import { makeTool } from '../util/tooling.js';
import { withError, withMeta } from '../util/responses.js';

const schema = z.object({
  clipboardText: z.string().optional(),
  imagePath: z.string().optional()
});

function parseClipboard(text: string) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  let base = '';
  let ilvl: number | undefined;
  const mods: Array<{ text: string; tier?: string; group?: string }> = [];
  const influenceFlags: string[] = [];
  let fractured = false;
  let veiled = false;

  for (const line of lines) {
    if (line.startsWith('Item Level')) {
      ilvl = Number(line.replace(/[^0-9]/g, ''));
    } else if (line.includes('Influence')) {
      influenceFlags.push(line);
    } else if (!base && !line.startsWith('Rarity')) {
      base = line;
    } else if (/Veiled/i.test(line)) {
      veiled = true;
      mods.push({ text: line });
    } else if (/Fractured/i.test(line)) {
      fractured = true;
      mods.push({ text: line });
    } else if (/Tier/i.test(line)) {
      const match = line.match(/\(Tier (\d+)\)/i);
      mods.push({ text: line, tier: match ? match[1] : undefined });
    } else if (base && !line.startsWith('Rarity')) {
      mods.push({ text: line });
    }
  }

  return { base, ilvl, mods, influenceFlags, fractured, veiled };
}

async function parseImage(imagePath: string) {
  const buffer = await fs.readFile(imagePath);
  const preprocessed = await sharp(buffer).resize({ width: 1280, withoutEnlargement: true }).grayscale().toBuffer();
  const { data } = await Tesseract.recognize(preprocessed, 'eng', {
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:+-() \'\\/'
  });
  return parseClipboard(data.text);
}

export const itemReadTool = makeTool(
  'item_read_tool',
  'Parse clipboard text or screenshot of an item to structured data',
  schema,
  async ({ clipboardText, imagePath }) => {
    const start = Date.now();
    const sources = ['local'];
    try {
      if (!clipboardText && !imagePath) {
        throw new Error('Provide clipboardText or imagePath');
      }

      const parsed = clipboardText
        ? parseClipboard(clipboardText)
        : await parseImage(path.resolve(imagePath!));

      return withMeta(parsed, {
        timingMs: Date.now() - start,
        sources
      });
    } catch (error) {
      return withError(error instanceof Error ? error.message : 'Unknown error', {
        timingMs: Date.now() - start,
        sources
      });
    }
  }
);
