'use strict';
// Frontend is served by Spring Boot, so relative API paths avoid CORS configuration.
const API_URL = '/api';
const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));

function showMessage(targetId, message, type = 'info') {
  const target = $(targetId);
  target.replaceChildren();
  const box = document.createElement('div');
  box.className = `notice ${type}`;
  box.textContent = message;
  target.appendChild(box);
}
function showHtml(targetId, html) { $(targetId).innerHTML = html; }
function safe(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
    });
  } catch (error) {
    throw new Error('Cannot connect to the backend. Make sure Spring Boot is running on port 8080.');
  }
  const raw = await response.text();
  let data = null;
  if (raw) { try { data = JSON.parse(raw); } catch { data = raw; } }
  if (!response.ok) {
    let message = typeof data === 'string' ? data : (data?.message || `Request failed (${response.status}).`);
    if (Array.isArray(data?.field_errors) && data.field_errors.length) {
      message += '\n' + data.field_errors.map((item) => `${item.field}: ${item.message}`).join('\n');
    }
    throw new Error(message);
  }
  return data;
}
function eventCard(event, seats = null) {
  return `<article class="event-card"><h3>${safe(event.name)}</h3><div class="event-meta">${safe(event.category)} · ${safe(event.venue)}<br>Event date: ${safe(event.event_date)} · Event ID: <strong>${safe(event.id)}</strong><br>Ticket price: <strong>${money(event.base_price)}</strong> · Total seats: ${safe(event.total_seats)}</div>${seats ? `<div class="data-grid"><div class="data-cell"><span>Seats available</span><strong>${safe(seats.seats_available)}</strong></div><div class="data-cell"><span>Total seats</span><strong>${safe(seats.total_seats)}</strong></div><div class="data-cell"><span>Ticket price</span><strong>${money(event.base_price)}</strong></div></div><p class="event-meta">Available seat numbers</p><div class="seat-list">${seats.available_seats?.length ? seats.available_seats.map((seat) => `<span class="seat-chip">${safe(seat)}</span>`).join('') : '<span class="event-meta">No seats are currently available.</span>'}</div>` : ''}<p><button class="button button-dark use-event" type="button" data-event-id="${safe(event.id)}">Use this event for booking →</button></p></article>`;
}
async function lookupEvent(id, targetId) {
  showMessage(targetId, 'Loading event details…');
  try {
    const event = await api(`/events/${encodeURIComponent(id)}`);
    let seats = null;
    try { seats = await api(`/events/${encodeURIComponent(id)}/seats`); } catch (_) { /* Keep event details visible if seat lookup fails. */ }
    showHtml(targetId, eventCard(event, seats));
    $('booking-event-id').value = event.id;
    $('summary-event-id').value = event.id;
    $('bookings-event-id').value = event.id;
  } catch (error) { showMessage(targetId, error.message, 'error'); }
}
document.addEventListener('click', (event) => {
  const button = event.target.closest('.use-event');
  if (!button) return;
  $('booking-event-id').value = button.dataset.eventId;
  $('book').scrollIntoView({ behavior: 'smooth' });
  $('seat-numbers').focus({ preventScroll: true });
});
$('find-event-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  await lookupEvent($('find-event-id').value.trim(), 'find-event-result');
});
$('create-event-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    name: $('event-name').value.trim(), category: $('event-category').value.trim(), venue: $('event-venue').value.trim(),
    event_date: $('event-date').value, total_seats: Number($('total-seats').value), base_price: Number($('base-price').value)
  };
  showMessage('create-event-result', 'Creating your event…');
  try {
    const created = await api('/events', { method: 'POST', body: JSON.stringify(payload) });
    showMessage('create-event-result', `Event created successfully! Your event ID is ${created.id}. You can use this ID to find the event, book tickets, or view its summary.`, 'success');
    $('find-event-id').value = created.id;
    $('booking-event-id').value = created.id;
    $('summary-event-id').value = created.id;
    $('bookings-event-id').value = created.id;
    event.target.reset();
    await lookupEvent(created.id, 'find-event-result');
  } catch (error) { showMessage('create-event-result', error.message, 'error'); }
});
$('seat-numbers').addEventListener('input', () => {
  const seats = $('seat-numbers').value.split(',').map((value) => value.trim()).filter(Boolean);
  if (seats.length > 0 && seats.length <= 6) $('seat-count').value = seats.length;
});
$('booking-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const seatNumbers = $('seat-numbers').value.split(',').map((value) => value.trim()).filter(Boolean).map(Number);
  const seats = Number($('seat-count').value);
  if (seatNumbers.some((seat) => !Number.isInteger(seat) || seat < 1)) { showMessage('booking-result', 'Enter valid positive seat numbers separated by commas.', 'error'); return; }
  if (new Set(seatNumbers).size !== seatNumbers.length) { showMessage('booking-result', 'A seat number cannot be repeated.', 'error'); return; }
  if (seatNumbers.length !== seats) { showMessage('booking-result', 'The number of seat numbers must match the number of tickets.', 'error'); return; }
  const payload = { event_id: Number($('booking-event-id').value), customer_email: $('customer-email').value.trim(), seat_numbers: seatNumbers, seats };
  showMessage('booking-result', 'Submitting booking…');
  try {
    const booking = await api('/bookings', { method: 'POST', body: JSON.stringify(payload) });
    const confirmed = booking.status === 'CONFIRMED';
    const details = `Booking ID: ${booking.id}\nStatus: ${booking.status}\nSeats: ${(booking.seat_number || seatNumbers).join(', ')}\nPrice per seat: ${money(booking.price_per_seat)}\nTotal amount: ${money(booking.total_amount)}`;
    showMessage('booking-result', `${confirmed ? 'Your booking is confirmed!' : `Booking not confirmed: ${booking.rejection_reason || 'Please review the booking details.'}`}\n${details}`, confirmed ? 'success' : 'error');
    await lookupEvent(payload.event_id, 'find-event-result');
  } catch (error) { showMessage('booking-result', error.message, 'error'); }
});
$('summary-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = $('summary-event-id').value.trim();
  showMessage('summary-result', 'Loading summary…');
  try {
    const s = await api(`/events/${encodeURIComponent(id)}/summary`);
    showHtml('summary-result', `<article class="event-card"><h3>${safe(s.name)} — Summary</h3><div class="event-meta">Event ID: ${safe(s.event_id)} · Demand: <strong>${safe(s.demand_band)}</strong></div><div class="data-grid"><div class="data-cell"><span>Total seats</span><strong>${safe(s.total_seats)}</strong></div><div class="data-cell"><span>Seats sold</span><strong>${safe(s.seats_sold)}</strong></div><div class="data-cell"><span>Seats available</span><strong>${safe(s.seats_available)}</strong></div><div class="data-cell"><span>Total revenue</span><strong>${money(s.total_revenue)}</strong></div><div class="data-cell"><span>Occupancy</span><strong>${safe(s.occupancy_pct)}%</strong></div></div></article>`);
  } catch (error) { showMessage('summary-result', error.message, 'error'); }
});
$('bookings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = $('bookings-event-id').value.trim();
  const status = $('booking-status-filter').value;
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  showMessage('bookings-result', 'Loading booking records…');
  try {
    const bookings = await api(`/events/${encodeURIComponent(id)}/bookings${query}`);
    if (!bookings.length) { showMessage('bookings-result', 'No bookings found for this event and status.', 'info'); return; }
    showHtml('bookings-result', `<article class="event-card"><h3>${bookings.length} booking record${bookings.length === 1 ? '' : 's'}</h3>${bookings.map((b) => `<div class="booking-row"><strong>Booking #${safe(b.id)}</strong> <span class="status-pill ${b.status === 'REJECTED' ? 'rejected' : ''}">${safe(b.status)}</span><br>${safe(b.customer_email)} · Seats: ${safe((b.seat_number || []).join(', '))} · Total: ${money(b.total_amount)}${b.rejection_reason ? `<br><span class="event-meta">Reason: ${safe(b.rejection_reason)}</span>` : ''}</div>`).join('')}</article>`);
  } catch (error) { showMessage('bookings-result', error.message, 'error'); }
});
// Set the minimum date to today's local date for event creation.
const today = new Date();
const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
$('event-date').min = localToday;
