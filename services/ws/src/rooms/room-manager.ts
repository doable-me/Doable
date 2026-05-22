import { Room } from "./room.js";

export class RoomManager {
  private rooms = new Map<string, Room>();

  getOrCreate(projectId: string): Room {
    let room = this.rooms.get(projectId);
    if (!room) {
      room = new Room(projectId);
      this.rooms.set(projectId, room);
    }
    return room;
  }

  get(projectId: string): Room | undefined {
    return this.rooms.get(projectId);
  }

  remove(projectId: string): void {
    this.rooms.delete(projectId);
  }

  /** Run idle checks on all rooms, remove empty rooms */
  tick(): void {
    for (const [projectId, room] of this.rooms) {
      const disconnected = room.checkIdle();
      for (const userId of disconnected) {
        room.leave(userId);
      }
      if (room.isEmpty) {
        room.destroy().catch((err) => {
          console.error(`[RoomManager] Failed to destroy room ${projectId}:`, err);
        });
        this.rooms.delete(projectId);
      }
    }
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  getTotalUsers(): number {
    let total = 0;
    for (const room of this.rooms.values()) total += room.size;
    return total;
  }
}
