import { Module } from '@nestjs/common';
import {
  GovernanceController,
  MemoryController,
  TasksController,
} from './workspace.controller.js';
import { WorkspaceService } from './workspace.service.js';

/**
 * Durable homes for what the portal previously kept in process memory:
 * task reports, memory records, and the governance trail.
 */
@Module({
  controllers: [TasksController, MemoryController, GovernanceController],
  providers: [WorkspaceService],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
