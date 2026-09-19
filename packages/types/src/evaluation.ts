/**
 * AI quality, as numbers.
 *
 * These exist because "the assistant seems good" is not a statement anyone can
 * act on, and because the failures that matter here — an answer with no
 * grounds, a citation pointing at the wrong document — are invisible in
 * ordinary monitoring.
 */

export const EVALUATION_METRICS = [
  'taskCompletion',
  'groundedness',
  'citationAccuracy',
  'retrievalQuality',
  'toolSelection',
  'hallucinationRate',
  'latencyMs',
  'failureRate',
] as const;

export type EvaluationMetric = (typeof EVALUATION_METRICS)[number];

export interface MetricDefinition {
  id: EvaluationMetric;
  label: string;
  description: string;
  /** True when a lower number is better. */
  lowerIsBetter: boolean;
  /** The value below (or above, when `lowerIsBetter`) which this is a problem. */
  threshold: number;
  unit: 'ratio' | 'ms';
}

export const METRIC_DEFINITIONS: Record<EvaluationMetric, MetricDefinition> = {
  taskCompletion: {
    id: 'taskCompletion',
    label: 'Penyelesaian tugas',
    description: 'Bagian tugas yang berakhir COMPLETED.',
    lowerIsBetter: false,
    threshold: 0.8,
    unit: 'ratio',
  },
  groundedness: {
    id: 'groundedness',
    label: 'Keterdasaran',
    description: 'Bagian jawaban berbasis pengetahuan yang benar-benar membawa sumber.',
    lowerIsBetter: false,
    threshold: 0.9,
    unit: 'ratio',
  },
  citationAccuracy: {
    id: 'citationAccuracy',
    label: 'Akurasi sitasi',
    description: 'Bagian sitasi yang menunjuk dokumen yang benar-benar diambil.',
    lowerIsBetter: false,
    threshold: 0.95,
    unit: 'ratio',
  },
  retrievalQuality: {
    id: 'retrievalQuality',
    label: 'Kualitas retrieval',
    description: 'Bagian pencarian yang mengembalikan setidaknya satu sumber relevan.',
    lowerIsBetter: false,
    threshold: 0.7,
    unit: 'ratio',
  },
  toolSelection: {
    id: 'toolSelection',
    label: 'Pemilihan tool',
    description: 'Bagian pemanggilan tool yang berada dalam deklarasi agen dan diizinkan.',
    lowerIsBetter: false,
    threshold: 0.98,
    unit: 'ratio',
  },
  hallucinationRate: {
    id: 'hallucinationRate',
    label: 'Tingkat halusinasi',
    description: 'Bagian jawaban yang menyatakan fakta tanpa sumber pendukung.',
    lowerIsBetter: true,
    threshold: 0.02,
    unit: 'ratio',
  },
  latencyMs: {
    id: 'latencyMs',
    label: 'Latensi',
    description: 'Waktu rata-rata sebuah tugas dari mulai hingga berakhir.',
    lowerIsBetter: true,
    threshold: 8000,
    unit: 'ms',
  },
  failureRate: {
    id: 'failureRate',
    label: 'Tingkat kegagalan',
    description: 'Bagian tugas yang berakhir FAILED, BLOCKED, atau CANCELLED.',
    lowerIsBetter: true,
    threshold: 0.15,
    unit: 'ratio',
  },
};

export interface MetricValue {
  metric: EvaluationMetric;
  value: number;
  /** How many observations the value rests on. */
  sample: number;
  /** False when the value is outside its threshold. */
  healthy: boolean;
}

export interface EvaluationReport {
  generatedAt: string;
  window: { from: string; to: string };
  metrics: MetricValue[];
  /** Metrics outside their threshold, most important first. */
  failing: EvaluationMetric[];
  /**
   * True when there is too little data to judge.
   *
   * Reported rather than hidden: a perfect score over three tasks says
   * nothing, and presenting it as quality would be the most misleading thing
   * this module could do.
   */
  insufficientData: boolean;
}

/** Below this many observations, a metric is not evidence of anything. */
export const MIN_SAMPLE = 5;

export function evaluateMetric(metric: EvaluationMetric, value: number, sample: number): MetricValue {
  const definition = METRIC_DEFINITIONS[metric];
  const healthy = definition.lowerIsBetter
    ? value <= definition.threshold
    : value >= definition.threshold;

  return { metric, value, sample, healthy: sample < MIN_SAMPLE ? true : healthy };
}
