/*
 * Copyright (C) Toppan Security. All rights reserved.
 *
 * This software and associated documentation files (the "Software") are proprietary
 * to Toppan Security and are protected by copyright law and international treaties.
 *
 * Unauthorized reproduction, distribution, or use of this Software, in whole or in
 * part, is strictly prohibited without the express written permission of Toppan Security.
 */

export const config = {
  TOPPAN_SERVICE_URL: import.meta.env.TOPPAN_SERVICE_URL || 'http://localhost:3888',
  APPLICATION_CONFIG_URL: import.meta.env.APPLICATION_CONFIG_URL || 'http://localhost:2021'
}