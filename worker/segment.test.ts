import { describe, expect, it } from 'vitest';
import { fillName } from './segment';

describe('fillName', () => {
  it('fills the placeholder and keeps punctuation tight', () => {
    expect(fillName('नमस्ते {name}!', 'Harsh')).toBe('नमस्ते Harsh!');
  });

  it('adds a space when the model glues the name to a word', () => {
    expect(fillName('உங்க மெசேஜ் இதோ{name}!', 'Harsh')).toBe('உங்க மெசேஜ் இதோ Harsh!');
    expect(fillName('{name}ji, welcome', 'Harsh')).toBe('Harsh ji, welcome');
  });

  it('drops the placeholder when the name is unknown', () => {
    expect(fillName('नमस्ते {name}, स्वागत है', undefined)).toBe('नमस्ते, स्वागत है');
  });
});
