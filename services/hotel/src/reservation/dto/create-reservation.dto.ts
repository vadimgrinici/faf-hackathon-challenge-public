import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { RoomType } from '../../../generated/prisma/client.js';

export class CreateReservationDto {
  @IsString()
  guest_id!: string;

  @IsEnum(RoomType)
  room_type!: RoomType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  guest_count!: number;

  // Optional list of guest IDs in the booking party. When provided, this is
  // what's used for room-capacity validation and what's persisted via the
  // ReservationGuest join table. guest_count is kept for backwards
  // compatibility / testing and is still always stored, but is no longer
  // the source of truth for capacity once a party is supplied.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  party_guest_ids?: string[];

  @Type(() => Number)
  @IsInt()
  check_in_day!: number;

  @Type(() => Number)
  @IsInt()
  check_out_day!: number;
}