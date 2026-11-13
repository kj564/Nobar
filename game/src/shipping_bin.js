// src/shipping_bin.js — fomt shipping_bin.hh + shipping_bin.cc (shipping bin)
//
// SOURCES (read line-by-line):
//   /tmp/fomt-repo/include/shipping_bin.hh    — ShippingBin struct (StatEnt[103], value_shipped)
//   /tmp/fomt-repo/src/shipping_bin.cc         — Ship, GetAmountShipped, HasShippedOneOfEachCrop/Mineral,
//                                                sStartingDisplayedProductList (22 pre-displayed)
//
// This module owns the shippingBin state and all ship/track mutations.
// Other modules import { shippingBin, shippingBinShip, ... } from './src/shipping_bin.js'.

import { SHIPPING_VALUE_MAX, SHIPPING_AMOUNT_MAX } from '../include/constants.js';

// ===== fomt 1:1 ShippingBin (shipping_bin.hh, shipping_bin.cc) =====
// - 103 StatEnt entries (one per product), each: amount_shipped (31-bit) + display_enabled (1-bit)
// - value_shipped: total G shipped, clamped to 1_000_000_000
// - 22 products pre-displayed from day 1 (sStartingDisplayedProductList)
// Constants SHIPPING_VALUE_MAX, SHIPPING_AMOUNT_MAX imported from include/constants.js
// (single source of truth — fomt shipping_bin.hh:10, 18).
export let shippingBin = {
  valueShipped: 0,
  stats: new Array(103).fill(null).map(() => ({ amountShipped: 0, displayEnabled: false })),
};

// fomt shipping_bin.cc:7-21 — sStartingDisplayedProductList (22 products pre-displayed)
export const SHIPPING_PRE_DISPLAYED = [
  'TURNIP','POTATO','CUCUMBER','CABBAGE','TOMATO','CORN','ONION','PINEAPPLE',
  'EGGPLANT','CARROT','SWEET_POTATO','GREEN_PEPPER',
  'REGULAR_QUALITY_EGG','GOOD_QUALITY_EGG','HIGH_QUALITY_EGG',
  'MILK_S','MILK_M','MILK_L',
  'WOOL_S','WOOL_M','WOOL_L',
  'CHOCOLATE',
];
export function initShippingBinFomt() {
  if (!window.FOMT || !window.FOMT.PRODUCT_BY_TAG) return;
  for (const tag of SHIPPING_PRE_DISPLAYED) {
    const p = window.FOMT.PRODUCT_BY_TAG[tag];
    if (p) shippingBin.stats[p.id].displayEnabled = true;
  }
}

// shippingBin.Ship (shipping_bin.cc:150-161)
export function shippingBinShip(productId, price) {
  if (price <= 0) return;
  shippingBin.stats[productId].amountShipped = Math.min(SHIPPING_AMOUNT_MAX, shippingBin.stats[productId].amountShipped + 1);
  shippingBin.stats[productId].displayEnabled = true;
  const oldValue = shippingBin.valueShipped;
  shippingBin.valueShipped = oldValue + Math.min(SHIPPING_VALUE_MAX - oldValue, price);
}
// shippingBin.GetAmountShipped (shipping_bin.cc:97-104)
export function shippingBinGetAmount(productId) {
  if (!shippingBin.stats[productId].displayEnabled) return 0;
  return shippingBin.stats[productId].amountShipped;
}
// shippingBin.HasShippedOneOfEachCrop (shipping_bin.cc:117-128)
export function shippingBinHasShippedAllCrops() {
  if (!window.FOMT || !window.FOMT.PRODUCT_BY_TAG) return false;
  const crops = ['TURNIP','POTATO','CUCUMBER','STRAWBERRY','CABBAGE','TOMATO','CORN','ONION','PINEAPPLE','PUMPKIN','EGGPLANT','CARROT','SWEET_POTATO','GREEN_PEPPER','SPINACH'];
  for (const tag of crops) {
    const p = window.FOMT.PRODUCT_BY_TAG[tag];
    if (!p) continue;
    if (!shippingBin.stats[p.id].displayEnabled || shippingBin.stats[p.id].amountShipped === 0) return false;
  }
  return true;
}
export function shippingBinHasShippedAllMinerals() {
  if (!window.FOMT || !window.FOMT.PRODUCT_BY_TAG) return false;
  const minerals = ['JUNK_ORE','COPPER','SILVER','GOLD','MYSTRILE','ORICHALC','ADAMANTITE','MYTHIC_STONE','PINK_DIAMOND','ALEXANDRITE','MOON_STONE','SAND_ROSE','DIAMOND','EMERALD','RUBY','TOPAZ','PERIDOT','FLUORITE','AGATE','AMETHYST'];
  for (const tag of minerals) {
    const p = window.FOMT.PRODUCT_BY_TAG[tag];
    if (!p) continue;
    if (!shippingBin.stats[p.id].displayEnabled || shippingBin.stats[p.id].amountShipped === 0) return false;
  }
  return true;
}
