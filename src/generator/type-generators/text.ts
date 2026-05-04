import { IsomorphColumnProfile } from '../../profiler/profile-writer';
import { RandomFn } from '../prng';

// Embedded word lists — no external dependency
const FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
  'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Charles', 'Karen', 'Daniel', 'Lisa', 'Matthew', 'Nancy',
  'Anthony', 'Betty', 'Mark', 'Margaret', 'Donald', 'Sandra', 'Steven', 'Ashley',
  'Paul', 'Dorothy', 'Andrew', 'Kimberly', 'Joshua', 'Emily', 'Kenneth', 'Donna',
  'Alex', 'Priya', 'Wei', 'Fatima', 'Omar', 'Yuki', 'Raj', 'Sofia', 'Liam', 'Ava',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
  'Chen', 'Patel', 'Kim', 'Singh', 'Nakamura', 'Sharma', 'Ali', 'Muller', 'Park', 'Tanaka',
];

const ADJECTIVES = [
  'cool', 'happy', 'fast', 'bright', 'dark', 'wild', 'calm', 'bold',
  'keen', 'free', 'shy', 'warm', 'cold', 'loud', 'soft', 'quick',
  'rare', 'deep', 'wise', 'fair', 'true', 'lazy', 'neat', 'slim',
];

const NOUNS = [
  'tiger', 'eagle', 'shark', 'wolf', 'fox', 'bear', 'hawk', 'lion',
  'panda', 'dolphin', 'falcon', 'cobra', 'raven', 'otter', 'lynx', 'crane',
  'coder', 'pixel', 'byte', 'node', 'spark', 'cloud', 'wave', 'star',
];

const DOMAINS = ['gmail.com', 'outlook.com', 'yahoo.com', 'proton.me', 'icloud.com', 'hey.com'];
const TLDS = ['com', 'io', 'dev', 'co', 'org', 'net', 'app'];

const LOREM_WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
  'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
  'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud',
  'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea', 'commodo',
  'consequat', 'duis', 'aute', 'irure', 'in', 'reprehenderit', 'voluptate',
];

function randomItem<T>(arr: T[], rng: RandomFn): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randomInt(min: number, max: number, rng: RandomFn): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randomAlphaNumeric(length: number, rng: RandomFn): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(rng() * chars.length)];
  }
  return result;
}

/**
 * Generate text values based on column name heuristics and profile bounds.
 */
export function generateText(column: IsomorphColumnProfile, columnName: string, rng: RandomFn): string {
  const name = columnName.toLowerCase();
  const maxLen = column.character_maximum_length ?? column.max_length ?? 255;

  if (name.includes('email')) {
    return generateEmail(maxLen, rng);
  }
  if ((name.includes('name') || name === 'first_name' || name === 'last_name' || name === 'full_name')
      && !name.includes('table') && !name.includes('column') && !name.includes('file')) {
    return generateName(name, maxLen, rng);
  }
  if (name.includes('phone') || name.includes('mobile') || name.includes('tel')) {
    return generatePhone(rng);
  }
  if (name.includes('url') || name.includes('website') || name.includes('link') || name.includes('avatar')) {
    return generateUrl(maxLen, rng);
  }
  if (name.includes('description') || name.includes('bio') || name.includes('notes')
      || name.includes('summary') || name.includes('body') || name.includes('content')) {
    return generateLorem(column.min_length ?? 20, Math.min(maxLen, column.max_length ?? 200), rng);
  }

  // Default: random alphanumeric
  const minL = column.min_length ?? 8;
  const maxL = Math.min(column.max_length ?? 32, maxLen);
  const len = randomInt(Math.max(1, minL), Math.max(1, maxL), rng);
  return randomAlphaNumeric(len, rng);
}

function generateEmail(maxLen: number, rng: RandomFn): string {
  const adj = randomItem(ADJECTIVES, rng);
  const noun = randomItem(NOUNS, rng);
  const num = randomInt(10, 99, rng);
  const domain = randomItem(DOMAINS, rng);
  const email = `${adj}.${noun}${num}@${domain}`;
  return email.substring(0, maxLen);
}

function generateName(columnName: string, maxLen: number, rng: RandomFn): string {
  if (columnName === 'first_name' || columnName === 'given_name') {
    return randomItem(FIRST_NAMES, rng).substring(0, maxLen);
  }
  if (columnName === 'last_name' || columnName === 'surname' || columnName === 'family_name') {
    return randomItem(LAST_NAMES, rng).substring(0, maxLen);
  }
  const full = `${randomItem(FIRST_NAMES, rng)} ${randomItem(LAST_NAMES, rng)}`;
  return full.substring(0, maxLen);
}

function generatePhone(rng: RandomFn): string {
  const cc = randomInt(1, 99, rng);
  const num = Array.from({ length: 10 }, () => randomInt(0, 9, rng)).join('');
  return `+${cc}-${num}`;
}

function generateUrl(maxLen: number, rng: RandomFn): string {
  const word = randomItem(NOUNS, rng);
  const tld = randomItem(TLDS, rng);
  const url = `https://${word}.${tld}`;
  return url.substring(0, maxLen);
}

function generateLorem(minLen: number, maxLen: number, rng: RandomFn): string {
  const targetLen = randomInt(Math.max(1, minLen), Math.max(1, maxLen), rng);
  let text = '';
  while (text.length < targetLen) {
    text += (text ? ' ' : '') + randomItem(LOREM_WORDS, rng);
  }
  return text.substring(0, targetLen);
}
