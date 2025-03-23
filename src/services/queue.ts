// src/services/queue.ts
import { Logger } from '../utils/logger.js';
import { updatePlayerInClan } from './dataupdater.js';
import { fetchClanBattlesData } from './wargaming/clanbattles.js';
import crypto from 'crypto';

/**
 * Job types supported by the queue
 */
export enum JobType {
  UPDATE_PLAYER = 'update_player',
  UPDATE_CLAN = 'update_clan',
  FETCH_CLAN_BATTLES = 'fetch_clan_battles',
  CUSTOM = 'custom'
}

/**
 * Base job interface
 */
export interface Job {
  id: string;
  type: JobType;
  data: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  result?: any;
}

/**
 * Queue for background processing jobs
 */
export class JobQueue {
  private queue: Job[] = [];
  private processing = false;
  private maxConcurrent = 1;
  private activeJobs = 0;
  
  /**
   * Create a new job queue
   * @param maxConcurrent Maximum number of concurrent jobs (default: 1)
   */
  constructor(maxConcurrent = 1) {
    this.maxConcurrent = maxConcurrent;
    
    // Start processing loop
    setInterval(() => this.processQueue(), 1000);
  }
  
  /**
   * Add a job to the queue
   * @param type Job type
   * @param data Job data
   * @returns Job ID
   */
  async addJob(type: JobType, data: any): Promise<string> {
    const id = crypto.randomUUID();
    const job: Job = {
      id,
      type,
      data,
      status: 'pending',
      createdAt: Date.now()
    };
    
    this.queue.push(job);
    Logger.debug(`Added job ${job.id} of type ${type} to queue`);
    
    return id;
  }
  
  /**
   * Add a job to update a player's data
   * @param playerId WG account ID
   * @param clanTag Clan tag
   * @returns Job ID
   */
  async addPlayerUpdateJob(playerId: string, clanTag: string): Promise<string> {
    return this.addJob(JobType.UPDATE_PLAYER, { playerId, clanTag });
  }
  
  /**
   * Add a job to fetch clan battles data
   * @param clanTag Clan tag
   * @returns Job ID
   */
  async addClanBattlesJob(clanTag: string): Promise<string> {
    return this.addJob(JobType.FETCH_CLAN_BATTLES, { clanTag });
  }
  
  /**
   * Get a job by ID
   * @param id Job ID
   * @returns Job or undefined if not found
   */
  getJob(id: string): Job | undefined {
    return this.queue.find(job => job.id === id);
  }
  
  /**
   * Get all jobs of a specific type
   * @param type Job type
   * @param status Optional status filter
   * @returns Array of matching jobs
   */
  getJobsByType(type: JobType, status?: Job['status']): Job[] {
    return this.queue.filter(job => 
      job.type === type && 
      (status === undefined || job.status === status)
    );
  }
  
  /**
   * Process the queue
   */
  private async processQueue(): Promise<void> {
    if (this.activeJobs >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }
    
    // Find next pending job
    const pendingJobIndex = this.queue.findIndex(job => job.status === 'pending');
    
    if (pendingJobIndex === -1) {
      return;
    }
    
    this.activeJobs++;
    
    const job = this.queue[pendingJobIndex];
    job.status = 'processing';
    job.startedAt = Date.now();
    
    Logger.debug(`Processing job ${job.id} of type ${job.type}`);
    
    try {
      // Process job based on type
      let result;
      
      switch (job.type) {
        case JobType.UPDATE_PLAYER:
          result = await this.processPlayerUpdateJob(job);
          break;
        case JobType.FETCH_CLAN_BATTLES:
          result = await this.processClanBattlesJob(job);
          break;
        case JobType.CUSTOM:
          if (typeof job.data.execute === 'function') {
            result = await job.data.execute();
          } else {
            throw new Error('Custom job missing execute function');
          }
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }
      
      // Mark job as completed
      job.status = 'completed';
      job.completedAt = Date.now();
      job.result = result;
      
      Logger.debug(`Job ${job.id} completed successfully`);
    } catch (error) {
      // Mark job as failed
      job.status = 'failed';
      job.completedAt = Date.now();
      job.error = error instanceof Error ? error.message : String(error);
      
      Logger.error(`Job ${job.id} failed:`, error);
    } finally {
      this.activeJobs--;
      
      // Clean up completed/failed jobs after 1 hour
      setTimeout(() => {
        const jobIndex = this.queue.findIndex(j => j.id === job.id);
        if (jobIndex !== -1) {
          this.queue.splice(jobIndex, 1);
        }
      }, 60 * 60 * 1000);
    }
  }
  
  /**
   * Process a player update job
   * @param job Job to process
   * @returns Result of the update
   */
  private async processPlayerUpdateJob(job: Job): Promise<any> {
    const { playerId, clanTag } = job.data;
    
    if (!playerId || !clanTag) {
      throw new Error('Missing required data for player update job');
    }
    
    return await updatePlayerInClan(playerId, clanTag);
  }
  
  /**
   * Process a clan battles fetch job
   * @param job Job to process
   * @returns Result of the fetch
   */
  private async processClanBattlesJob(job: Job): Promise<any> {
    const { clanTag } = job.data;
    
    if (!clanTag) {
      throw new Error('Missing required data for clan battles job');
    }
    
    return await fetchClanBattlesData(clanTag);
  }
}

// Export singleton instance
export const jobQueue = new JobQueue();