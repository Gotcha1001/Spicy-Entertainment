/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ageVerification from "../ageVerification.js";
import type * as assets from "../assets.js";
import type * as bookings from "../bookings.js";
import type * as calendar from "../calendar.js";
import type * as callAccess from "../callAccess.js";
import type * as calls from "../calls.js";
import type * as crons from "../crons.js";
import type * as dancerAvailability from "../dancerAvailability.js";
import type * as fx from "../fx.js";
import type * as hostPayout from "../hostPayout.js";
import type * as hosts from "../hosts.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_availability from "../lib/availability.js";
import type * as lib_currency from "../lib/currency.js";
import type * as lib_fees from "../lib/fees.js";
import type * as lib_fxRates from "../lib/fxRates.js";
import type * as lib_geo from "../lib/geo.js";
import type * as lib_hostRules from "../lib/hostRules.js";
import type * as lib_locale from "../lib/locale.js";
import type * as lib_schedule from "../lib/schedule.js";
import type * as lib_showWindow from "../lib/showWindow.js";
import type * as lib_slots from "../lib/slots.js";
import type * as lib_timezones from "../lib/timezones.js";
import type * as lib_validators from "../lib/validators.js";
import type * as likes from "../likes.js";
import type * as notifications from "../notifications.js";
import type * as payments from "../payments.js";
import type * as payouts from "../payouts.js";
import type * as reviews from "../reviews.js";
import type * as roles from "../roles.js";
import type * as safety from "../safety.js";
import type * as uploads from "../uploads.js";
import type * as user from "../user.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ageVerification: typeof ageVerification;
  assets: typeof assets;
  bookings: typeof bookings;
  calendar: typeof calendar;
  callAccess: typeof callAccess;
  calls: typeof calls;
  crons: typeof crons;
  dancerAvailability: typeof dancerAvailability;
  fx: typeof fx;
  hostPayout: typeof hostPayout;
  hosts: typeof hosts;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/availability": typeof lib_availability;
  "lib/currency": typeof lib_currency;
  "lib/fees": typeof lib_fees;
  "lib/fxRates": typeof lib_fxRates;
  "lib/geo": typeof lib_geo;
  "lib/hostRules": typeof lib_hostRules;
  "lib/locale": typeof lib_locale;
  "lib/schedule": typeof lib_schedule;
  "lib/showWindow": typeof lib_showWindow;
  "lib/slots": typeof lib_slots;
  "lib/timezones": typeof lib_timezones;
  "lib/validators": typeof lib_validators;
  likes: typeof likes;
  notifications: typeof notifications;
  payments: typeof payments;
  payouts: typeof payouts;
  reviews: typeof reviews;
  roles: typeof roles;
  safety: typeof safety;
  uploads: typeof uploads;
  user: typeof user;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
