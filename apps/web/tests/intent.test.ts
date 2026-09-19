import { describe, expect, it } from 'vitest';
import { classifyIntent } from '@/lib/tania/intent';

describe('intent classifier', () => {
  it.each([
    ['Analisis kinerja portofolio kuartal ini', 'ANALYZE'],
    ['Buatkan draf proposal solusi', 'CREATE'],
    ['Jalankan workflow laporan mingguan', 'AUTOMATE'],
    ['Cari kebijakan cuti', 'SEARCH'],
    ['Halo, apa kabar hari ini', 'CONVERSE'],
  ])('classifies %s as %s', (message, expected) => {
    expect(classifyIntent(message)).toBe(expected);
  });
});
