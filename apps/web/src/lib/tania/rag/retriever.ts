/**
 * RAG abstraction for the portal.
 *
 * The contract is the shared `knowledge.KnowledgeRetriever` port. Permission
 * filtering belongs inside the implementation, before scoring.
 */
export type { KnowledgeRetriever, RetrievalQuery } from '@tania/core/knowledge';
