// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { EvidenceList } from '@/components/workspace/evidence-list';
import type { Citation, Evidence } from '@tania/types';

/**
 * Citations as the reader sees them.
 *
 * A citation exists so someone can go and check the sentence. That only works
 * if the surface carries enough to find it — which document, which section,
 * and how sensitive it is — and if the marker on screen matches the one the
 * answer text refers to. An answer that cites `[2]` while the list starts at
 * `[1]` is worse than an uncited one: it looks verified and is not.
 */

function citation(overrides: Partial<Citation> = {}): Citation {
  return {
    id: 'doc.sop-approval#s2:1',
    documentId: 'doc.sop-approval',
    title: 'SOP — Persetujuan Aksi Berisiko Tinggi',
    source: 'Chapter DPS / Governance',
    snippet: 'Aksi berisiko tinggi memerlukan persetujuan atasan langsung.',
    classification: 'INTERNAL',
    updatedAt: '2026-09-01',
    score: 0.82,
    locator: 'Prosedur · hlm. 3',
    marker: 1,
    ...overrides,
  } as Citation;
}

describe('EvidenceList', () => {
  it('shows where a passage came from', () => {
    render(<EvidenceList evidence={[citation()]} />);

    expect(screen.getByText('SOP — Persetujuan Aksi Berisiko Tinggi')).toBeInTheDocument();
    expect(screen.getByText('Prosedur · hlm. 3')).toBeInTheDocument();
    expect(screen.getByText('Chapter DPS / Governance')).toBeInTheDocument();
  });

  it('shows how sensitive the source is', () => {
    // A reader forwarding an answer needs to know what they are forwarding.
    render(<EvidenceList evidence={[citation({ classification: 'CONFIDENTIAL' })]} />);

    expect(screen.getByText('CONFIDENTIAL')).toBeInTheDocument();
  });

  it('renders each marker as the answer text refers to it', () => {
    render(
      <EvidenceList
        evidence={[
          citation({ id: 'a', marker: 1, title: 'Dokumen A' }),
          citation({ id: 'b', marker: 2, title: 'Dokumen B' }),
          citation({ id: 'c', marker: 3, title: 'Dokumen C' }),
        ]}
      />,
    );

    for (const marker of [1, 2, 3]) {
      expect(screen.getByLabelText(`Sumber ${marker}`)).toBeInTheDocument();
    }
  });

  it('keeps the marker with its own document', () => {
    render(
      <EvidenceList
        evidence={[
          citation({ id: 'a', marker: 1, title: 'Dokumen A' }),
          citation({ id: 'b', marker: 2, title: 'Dokumen B' }),
        ]}
      />,
    );

    // The pairing is the whole point: marker 2 must sit with Dokumen B.
    const second = screen.getByLabelText('Sumber 2').closest('li');
    expect(second).not.toBeNull();
    expect(within(second as HTMLElement).getByText('Dokumen B')).toBeInTheDocument();
  });

  it('numbers plain evidence positionally when it carries no marker', () => {
    // Built without the keys rather than with them set to undefined: the
    // component distinguishes the two with `in`, and so must the fixture.
    const plain: Evidence[] = [
      {
        id: 'doc.report-delivery',
        title: 'Delivery Health Report',
        source: 'DMO',
        snippet: 'Ringkasan kesehatan delivery.',
        classification: 'INTERNAL',
        updatedAt: '2026-09-12',
        score: 0.7,
      },
    ];

    render(<EvidenceList evidence={plain} />);

    expect(screen.getByLabelText('Sumber 1')).toBeInTheDocument();
    expect(screen.getByText('Delivery Health Report')).toBeInTheDocument();
  });

  it('says plainly when an answer has no sources', () => {
    // Silence here would let an ungrounded answer pass for a grounded one.
    render(<EvidenceList evidence={[]} />);

    expect(screen.getByText(/belum memiliki rujukan/)).toBeInTheDocument();
  });

  it('presents the citations as an ordered list', () => {
    render(<EvidenceList evidence={[citation({ id: 'a' }), citation({ id: 'b', marker: 2 })]} />);

    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
