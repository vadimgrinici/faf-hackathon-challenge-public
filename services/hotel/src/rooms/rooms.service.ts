import { Injectable } from '@nestjs/common';
import { ReservationStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { SimulationService } from '../simulation/simulation.service';
import { RoomsResponseDto } from './dto/rooms-response.dto';

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly simulation: SimulationService,
  ) {}

  async findAll(): Promise<RoomsResponseDto> {
    const currentDay = this.simulation.currentDay();

    const [rooms, activeReservations] = await Promise.all([
      this.prisma.room.findMany({
        orderBy: { id: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: {
          status: ReservationStatus.CONFIRMED,
          check_in_day: { lte: currentDay },
          check_out_day: { gt: currentDay },
        },
        include: { party: true },
      }),
    ]);

    // Occupancy reflects the actual party size when one was supplied at
    // booking time, falling back to guest_count otherwise — same rule used
    // for capacity validation in ReservationService.create().
    const currentGuestsByRoomId = new Map<string, number>();
    for (const reservation of activeReservations) {
      const partySize =
        reservation.party.length > 0
          ? reservation.party.length
          : reservation.guest_count;
      const previous = currentGuestsByRoomId.get(reservation.room_id) ?? 0;
      currentGuestsByRoomId.set(reservation.room_id, previous + partySize);
    }

    return {
      rooms: rooms.map((room) => ({
        id: room.id,
        type: room.type,
        capacity: room.capacity,
        price_per_night: room.price_per_night,
        current_guests: currentGuestsByRoomId.get(room.id) ?? 0,
      })),
    };
  }
}