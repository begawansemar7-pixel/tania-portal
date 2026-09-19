import type { AvatarEvent, AvatarEventType, TaniaCommand } from '@tania/types';

export type AvatarEventListener = (event: AvatarEvent) => void;

/**
 * Everything the avatar reacts to, on one channel.
 *
 * The reason events are typed rather than collapsed into "the current command"
 * is frequency. A pose change happens a few times a minute; a viseme happens
 * five times a second. A renderer that treats both the same either re-renders
 * itself continuously or misses pose changes — so they travel separately and
 * subscribers choose what to listen to.
 *
 * The last command is replayed to new subscribers, so an avatar that finishes
 * loading mid-conversation adopts the pose in progress. Speech events are not
 * replayed: a viseme from two seconds ago is not worth showing.
 */
export class AvatarEventBus {
  private readonly listeners = new Map<AvatarEventType | '*', Set<AvatarEventListener>>();
  private current: TaniaCommand = { state: 'IDLE' };

  /** The pose the avatar should currently be in. */
  last(): TaniaCommand {
    return this.current;
  }

  emit(event: AvatarEvent): void {
    if (event.type === 'command') this.current = event.command;

    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    for (const listener of this.listeners.get('*') ?? []) listener(event);
  }

  /** Shorthand for the common case: change the pose. */
  command(command: TaniaCommand): void {
    this.emit({ type: 'command', command });
  }

  /** Changes part of the pose, keeping the rest. */
  patch(partial: Partial<TaniaCommand>): void {
    this.command({ ...this.current, ...partial });
  }

  /**
   * Subscribes to one kind of event, or to all of them.
   *
   * A command subscriber is given the current pose immediately; anything else
   * waits for the next event of its kind.
   */
  on(type: AvatarEventType | '*', listener: AvatarEventListener): () => void {
    const set = this.listeners.get(type) ?? new Set<AvatarEventListener>();
    set.add(listener);
    this.listeners.set(type, set);

    if (type === 'command' || type === '*') {
      listener({ type: 'command', command: this.current });
    }

    return () => {
      set.delete(listener);
    };
  }

  /** Convenience for the most common subscription. */
  onCommand(listener: (command: TaniaCommand) => void): () => void {
    return this.on('command', (event) => {
      if (event.type === 'command') listener(event.command);
    });
  }

  /** Drops every subscriber. Used when the avatar is torn down. */
  clear(): void {
    this.listeners.clear();
  }
}

/** The bus the portal shares. One avatar, one source of instructions. */
export const avatarEvents = new AvatarEventBus();
