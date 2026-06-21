import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, ReservationStatus } from '../../generated/prisma/client.js';
import { AirportService } from '../airport/airport.service';
import { BroadcastService } from '../broadcast/broadcast.service';
import { HotelBroadcastEventType } from '../broadcast/hotel-events';
import { PrismaService } from '../prisma/prisma.service';
import { CancelReservationResponseDto } from './dto/cancel-reservation-response.dto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationResponseDto } from './dto/reservation-response.dto';

@Injectable()
export class ReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcast: BroadcastService,
    private readonly airport: AirportService,
  ) {}

  async create(
    createReservationDto: CreateReservationDto,
  ): Promise<ReservationResponseDto> {
    if (
      createReservationDto.check_out_day <= createReservationDto.check_in_day
    ) {
      throw new HttpException(
        { error: 'check_out_day must be greater than check_in_day' },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Capacity is validated against the actual party when one is supplied;
    // guest_count remains the fallback so existing callers that only send
    // guest_count keep working exactly as before.
    const partyGuestIds = createReservationDto.party_guest_ids ?? [];
    const partySize =
      partyGuestIds.length > 0
        ? partyGuestIds.length
        : createReservationDto.guest_count;

    const rooms = await this.prisma.room.findMany({
      where: { type: createReservationDto.room_type },
      orderBy: { id: 'asc' },
    });

    const maxCapacity = Math.max(...rooms.map((room) => room.capacity));
    if (partySize > maxCapacity) {
      throw new HttpException(
        {
          error: `Room type ${createReservationDto.room_type} supports at most ${maxCapacity} guests`,
        },
        HttpStatus.CONFLICT,
      );
    }

    let availableRoom: (typeof rooms)[number] | null = null;

    for (const room of rooms) {
      if (partySize > room.capacity) {
        continue;
      }

      const overlappingReservationCount = await this.prisma.reservation.count({
        where: {
          room_id: room.id,
          status: ReservationStatus.CONFIRMED,
          check_in_day: { lte: createReservationDto.check_out_day },
          check_out_day: { gte: createReservationDto.check_in_day },
        },
      });

      if (overlappingReservationCount === 0) {
        availableRoom = room;
        break;
      }
    }

    if (!availableRoom) {
      throw new HttpException(
        {
          error: `No available rooms of type ${createReservationDto.room_type} for days ${createReservationDto.check_in_day}-${createReservationDto.check_out_day}`,
        },
        HttpStatus.CONFLICT,
      );
    }

    const reservation = await this.prisma.reservation.create({
      data: {
        guest_id: createReservationDto.guest_id,
        room_id: availableRoom.id,
        guest_count: createReservationDto.guest_count,
        check_in_day: createReservationDto.check_in_day,
        check_out_day: createReservationDto.check_out_day,
        status: ReservationStatus.CONFIRMED,
        party: partyGuestIds.length
          ? {
              create: partyGuestIds.map((guestId) => ({
                guest_id: guestId,
              })),
            }
          : undefined,
      },
      include: { party: true },
    });

    await this.rejectIfGuestHasNotClearedAirport(reservation.guest_id);

    await this.broadcast.publishHotelEvent(
      HotelBroadcastEventType.ReservationConfirmed,
      {
        message: 'Hotel reservation confirmed.',
        reservation_id: reservation.id,
        guest_id: reservation.guest_id,
        room_type: availableRoom.type,
        guest_count: reservation.guest_count,
        check_in_day: reservation.check_in_day,
        check_out_day: reservation.check_out_day,
      },
    );

    return {
      id: reservation.id,
      guest_id: reservation.guest_id,
      room_id: reservation.room_id,
      room_type: availableRoom.type,
      guest_count: reservation.guest_count,
      party_guest_ids: reservation.party.map((p) => p.guest_id),
      check_in_day: reservation.check_in_day,
      check_out_day: reservation.check_out_day,
      status: reservation.status,
    };
  }

  private async rejectIfGuestHasNotClearedAirport(
    guestId: string,
  ): Promise<void> {
    const hasClearedAirport =
      await this.airport.hasGuestClearedProcessing(guestId);

    if (hasClearedAirport === false) {
      throw new HttpException(
        { error: 'Guest has not cleared airport processing' },
        HttpStatus.CONFLICT,
      );
    }
  }

  // see findActiveByGuestId for the optimized query path
  async findById(id: string): Promise<ReservationResponseDto> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: { room: true, party: true },
    });

    if (!reservation) {
      throw new HttpException(
        { error: 'Reservation not found' },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      id: reservation.id,
      guest_id: reservation.guest_id,
      room_id: reservation.room_id,
      room_type: reservation.room.type,
      guest_count: reservation.guest_count,
      party_guest_ids: reservation.party.map((p) => p.guest_id),
      check_in_day: reservation.check_in_day,
      check_out_day: reservation.check_out_day,
      status: reservation.status,
    };
  }

  async findActiveByGuestId(guestId: string): Promise<ReservationResponseDto> {
    const rows = await this.prisma.$queryRaw<any[]>(
      Prisma.sql`
        SELECT r.id, r.guest_id, r.room_id, r.guest_count, r.check_in_day, r.check_out_day, r.status,
               rm.type AS room_type
        FROM "Reservation" r
        JOIN "Room" rm ON rm.id = r.room_id
        WHERE r.guest_id = ${guestId}
          AND r.status = 'CONFIRMED'
        ORDER BY r.check_in_day DESC
        LIMIT 1
      `,
    );

    if (!rows.length) {
      throw new HttpException(
        { error: 'Reservation not found' },
        HttpStatus.NOT_FOUND,
      );
    }

    const row = rows[0];
    const party = await this.prisma.reservationGuest.findMany({
      where: { reservation_id: row.id },
    });

    return {
      id: row.id,
      guest_id: row.guest_id,
      room_id: row.room_id,
      room_type: row.room_type,
      guest_count: row.guest_count,
      party_guest_ids: party.map((p) => p.guest_id),
      check_in_day: row.check_in_day,
      check_out_day: row.check_out_day,
      status: row.status,
    };
  }

  async cancel(id: string): Promise<CancelReservationResponseDto> {
    const existing = await this.prisma.reservation.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new HttpException(
        { error: 'Reservation not found' },
        HttpStatus.NOT_FOUND,
      );
    }

    if (existing.status === ReservationStatus.CANCELLED) {
      // Already cancelled — no-op. No broadcast event, since there's no
      // active-to-cancelled transition happening here.
      return {
        id: existing.id,
        status: existing.status,
      };
    }

    // Conditional UPDATE (status != CANCELLED) so the active->cancelled
    // transition is atomic: under concurrent cancel calls for the same
    // reservation, only one request's UPDATE actually matches a row, so
    // only one broadcast event is ever emitted.
    const updatedCount = await this.prisma.$executeRaw(
      Prisma.sql`UPDATE "Reservation" SET status = 'CANCELLED' WHERE id = ${id} AND status != 'CANCELLED'`,
    );

    const reservation = await this.prisma.reservation.findUniqueOrThrow({
      where: { id },
      include: { room: true },
    });

    if (updatedCount === 0) {
      // Lost the race to another concurrent cancel — already cancelled by
      // the time our UPDATE ran. Treat the same as the already-cancelled
      // no-op path: no event.
      return {
        id: reservation.id,
        status: reservation.status,
      };
    }

    await this.broadcast.publishHotelEvent(
      HotelBroadcastEventType.ReservationCancelled,
      {
        message: 'Hotel reservation cancelled.',
        reservation_id: reservation.id,
        guest_id: reservation.guest_id,
        room_type: reservation.room.type,
        guest_count: reservation.guest_count,
        check_in_day: reservation.check_in_day,
        check_out_day: reservation.check_out_day,
      },
    );

    return {
      id: reservation.id,
      status: reservation.status,
    };
  }
}