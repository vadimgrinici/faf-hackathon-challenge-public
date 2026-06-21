-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN "guest_count" INTEGER NOT NULL DEFAULT 1;

-- Remove default after backfilling existing rows so future writes must provide it.
ALTER TABLE "Reservation" ALTER COLUMN "guest_count" DROP DEFAULT;

-- CreateTable
-- Join table representing the 1-to-many relationship between a reservation
-- and the guests in its party. guest_id is a plain string (same convention
-- as Reservation.guest_id / Arrival.guest_id elsewhere) — there is no
-- canonical "Guest" table anywhere in the system to foreign-key against.
CREATE TABLE "ReservationGuest" (
    "id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "guest_id" TEXT NOT NULL,

    CONSTRAINT "ReservationGuest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReservationGuest_reservation_id_idx" ON "ReservationGuest"("reservation_id");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationGuest_reservation_id_guest_id_key" ON "ReservationGuest"("reservation_id", "guest_id");

-- AddForeignKey
ALTER TABLE "ReservationGuest" ADD CONSTRAINT "ReservationGuest_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;