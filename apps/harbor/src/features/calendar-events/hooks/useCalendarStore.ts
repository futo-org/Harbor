import type { PolycentricClient, v2 } from '@polycentric/react-native-sdk';
import { create } from 'zustand';
import type { CalendarEventData } from '../lib/calendar-event';
import { loadOwnEventsAndRsvps } from '../lib/own-events';

type CalendarState = {
  /** Our own events from local storage. Shown before they sync */
  ownEvents: CalendarEventData[];
  /** Our RSVP for each event, by event id */
  rsvps: Map<string, v2.CalendarEventRsvpStatus>;

  /** Load our events and RSVPs from local storage */
  refreshOwn: (client: PolycentricClient) => void;
};

/** What we've created and answered. Changes go through lib/calendar-actions */
const useCalendarStore = create<CalendarState>((set) => ({
  ownEvents: [],
  rsvps: new Map(),

  refreshOwn: (client) => set(loadOwnEventsAndRsvps(client)),
}));

export default useCalendarStore;
