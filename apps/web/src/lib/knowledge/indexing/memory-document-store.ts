import type {
  DocumentDescriptor,
  DocumentStore,
  EnterpriseDocument,
} from '@tania/core/knowledge';

/**
 * Process-local document store.
 *
 * Holds the source of truth for document bodies and ACLs. A database-backed
 * adapter replaces this without touching ingestion, retrieval, or citations.
 */
export class InMemoryDocumentStore implements DocumentStore {
  readonly id = 'memory';
  private readonly documents = new Map<string, EnterpriseDocument>();

  constructor(seed: readonly EnterpriseDocument[] = []) {
    for (const document of seed) this.documents.set(document.id, document);
  }

  async get(documentId: string): Promise<EnterpriseDocument | undefined> {
    return this.documents.get(documentId);
  }

  async list(): Promise<DocumentDescriptor[]> {
    return [...this.documents.values()].map(toDescriptor);
  }

  async put(document: EnterpriseDocument): Promise<DocumentDescriptor> {
    this.documents.set(document.id, document);
    return toDescriptor(document);
  }

  async remove(documentId: string): Promise<void> {
    this.documents.delete(documentId);
  }
}

export function toDescriptor(document: EnterpriseDocument): DocumentDescriptor {
  return {
    id: document.id,
    title: document.title,
    kind: document.kind,
    source: document.source,
    owner: document.owner,
    updatedAt: document.updatedAt,
    acl: document.acl,
    summary: document.summary,
    ...(document.url === undefined ? {} : { url: document.url }),
    ...(document.tags === undefined ? {} : { tags: document.tags }),
  };
}
