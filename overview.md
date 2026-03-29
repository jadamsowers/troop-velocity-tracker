# Troop Velocity Tracker

A progressive web app that uses the Scoutbook API to track Scout advancement progress. The app pulls DOB, join dates, and rank information to identify scouts who need attention to stay on pace for Eagle Scout before turning 18.

## Features

### Status Indicators (Red/Yellow/Green)

Each scout is assigned a status based on multiple advancement factors:

**RED 🚨 — Critical:** Scout needs immediate attention
- Less than 7 months until age 18
- More than 2 required merit badges short when eligible for next rank

**YELLOW ⚠️ — At Risk:** Scout is falling behind pace
- Age 17 or older (13+ months until 18) UNLESS Life rank with strong Eagle progress
- No rank advancement in 12+ months
- Eligible for next rank for 3+ months but hasn't advanced
- Short on required merit badges when eligible

**GREEN ✅ — On Track:** Scout is progressing well
- Life rank working toward Eagle with good merit badge progress and plenty of time
- Meeting velocity expectations and wait period requirements

### Scout Details

Each scout card displays:
- **Advancement Timeline:** Visual representation of ranks earned with projected Eagle timeline
- **Current Rank & Status:** Color-coded indicator with detailed reason
- **Merit Badge Progress:** Count toward Eagle requirements (21 total needed)
- **Wait Time Progress:** Visual indicators for rank wait periods (4 months: FC→Star, 6 months: Star→Life, 6 months: Life→Eagle)
- **Email Integration:** Draft progress report emails directly to scout and parents

### Scout Management

**Filtering & Sorting:**
- Filter scouts by partial name (case-insensitive)
- Sort by: risk level, time since last rank, name, age, or rank

**Scout Comparison:**
- Check boxes next to scout names to select for comparison
- Click "Compare" button to view only selected scouts side-by-side
- Compare table shows name, current rank, merit badge count, and status
- Click "Clear" to exit comparison mode

## Status Determination Logic

Status is determined by checking these factors in order of severity:

1. **Age:** If less than 7 months until age 18, status is red
2. **Life Scout Exception:** Life scouts with ≤3 missing Eagle requirements and 13+ months until 18 can be green despite age
3. **Rank Velocity:** No advancement in 12+ months triggers yellow
4. **Wait Period Adherence:** More than 3 months overdue for next rank triggers yellow
5. **Merit Badge Requirements:** Short badges when eligible for next rank triggers red or yellow

## Technology

- **Data Source:** Scoutbook API
- **Auth:** JWT tokens from scoutbook login script
- **Frontend:** React with TypeScript
- **Date Calculations:** date-fns library
- **Reference Project:** https://github.com/natbros-git/scouts-cli