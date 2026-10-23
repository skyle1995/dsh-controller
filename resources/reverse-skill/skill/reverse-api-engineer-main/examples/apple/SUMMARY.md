# API Reverse Engineering Summary

**Date:** December 22, 2025
**Source:** HAR file analysis from jobs.apple.com
**Objective:** Extract job listings with URL, Title, Location, and Description

---

## ✅ What Was Accomplished

### 1. HAR File Analysis
- **Total Entries Analyzed:** 468KB HAR file with 57 associated payload files
- **API Endpoints Discovered:** 2 main endpoints
- **Request/Response Patterns:** Fully documented

### 2. API Endpoints Reverse Engineered

#### Endpoint 1: CSRF Token
- **URL:** `GET https://jobs.apple.com/api/v1/CSRFToken`
- **Purpose:** Obtain authentication token for search requests
- **Authentication:** Session-based with cookies
- **Response:** Returns CSRF token in `x-apple-csrf-token` header

#### Endpoint 2: Job Search
- **URL:** `POST https://jobs.apple.com/api/v1/search`
- **Purpose:** Search and retrieve job listings
- **Authentication:** Requires CSRF token from endpoint 1
- **Pagination:** Returns ~20 jobs per page
- **Total Jobs Available:** 6,179 (as of testing)

### 3. Authentication Pattern Identified

```
1. GET /CSRFToken
   ↓ Returns CSRF token + session cookies
2. POST /search (with token + cookies)
   ↓ Returns job listings
```

**Required Headers:**
- `x-apple-csrf-token`: Token from step 1
- `browserlocale`: Locale string (e.g., "en-us")
- `locale`: Uppercase locale (e.g., "EN_US")
- Session cookies: `jobs`, `jssid`, `AWSALBAPP-*`

### 4. Data Structure Mapped

**Job Object Fields:**
```json
{
  "id": "PIPE-200125391",
  "positionId": "200125391",
  "postingTitle": "FR-Business Pro",
  "postingDate": "Dec 22, 2025",
  "jobSummary": "Full description text...",
  "locations": [
    {
      "name": "France",
      "city": "",
      "countryName": "France",
      "countryID": "iso-country-FRA"
    }
  ],
  "team": {
    "teamName": "Apple Retail",
    "teamCode": "APPST"
  },
  "standardWeeklyHours": 35,
  "homeOffice": false,
  "transformedPostingTitle": "fr-business-pro"
}
```

**URL Format:**
```
https://jobs.apple.com/en-us/details/{positionId}/{transformedPostingTitle}
```

---

## 📦 Deliverables

### 1. Production-Ready Python Client
**File:** `api_client.py` (497 lines)

**Features:**
- ✅ Automatic CSRF token management
- ✅ Session management with cookies
- ✅ Type-safe data classes (`Job`, `Location`, `Team`)
- ✅ Comprehensive error handling
- ✅ Logging support
- ✅ Pagination support
- ✅ Full type hints and docstrings

**Main Classes:**
- `AppleJobsAPI`: Main API client
- `Job`: Job posting data class (with auto-generated URLs)
- `Location`: Location data class
- `Team`: Team/department data class

**Main Methods:**
- `search_jobs()`: Search with filters and pagination
- `get_total_jobs()`: Get count of matching jobs
- `search_all_jobs()`: Auto-paginate through all results

### 2. Comprehensive Documentation
**File:** `README.md` (450+ lines)

**Contents:**
- API endpoint documentation
- Authentication flow diagrams
- Request/response examples
- Python client usage guide
- Code examples for common use cases
- Data structure reference
- Troubleshooting tips

### 3. Quick Start Script
**File:** `quick_example.py` (102 lines)

**Features:**
- Interactive job fetching
- JSON export capability
- Multi-page fetching
- User-friendly output

### 4. Additional Files
- `requirements.txt`: Python dependencies
- `SUMMARY.md`: This file

---

## 🎯 User Requirements Met

The user requested extraction of:
1. ✅ **URL** - Generated from `positionId` and `transformedPostingTitle`
2. ✅ **Title** - Available as `postingTitle`
3. ✅ **Location** - Available in `locations[].name`
4. ✅ **Description** - Available as `jobSummary`

**Example Usage:**
```python
from api_client import AppleJobsAPI

client = AppleJobsAPI(locale="en-us")
jobs = client.search_jobs(page=1)

for job in jobs:
    print(f"URL: {job.url}")
    print(f"Title: {job.postingTitle}")
    print(f"Location: {job.locations[0].name}")
    print(f"Description: {job.jobSummary}")
```

---

## ✨ Testing Results

**Test Date:** December 22, 2025

```
✓ Client initialized successfully
✓ Retrieved 20 jobs from page 1
✓ Total jobs available: 6,179
✓ All requested fields extracted successfully

First Job Example:
  Title: FR-Business Pro
  Location: France
  URL: https://jobs.apple.com/en-us/details/200125391/fr-business-pro
  Description: Apple Retail is where the best of Apple comes together...
```

**Status:** ✅ **All tests passed**

---

## 🔧 Technical Details

### Request Patterns Identified

**Search Request:**
```json
POST /api/v1/search
Content-Type: application/json
x-apple-csrf-token: <token>

{
  "query": "",
  "filters": {},
  "page": 1,
  "locale": "en-us",
  "sort": "",
  "format": {
    "longDate": "MMMM D, YYYY",
    "mediumDate": "MMM D, YYYY"
  }
}
```

**Response Structure:**
```json
{
  "res": {
    "searchResults": [...],
    "totalRecords": 6179
  }
}
```

### Cookies Identified

From CSRF endpoint:
- `jobs`: Session identifier
- `jssid`: Session ID with signature
- `AWSALBAPP-0/1/2/3`: AWS load balancer cookies
- `geo`: Geographic location
- `s_fid`, `s_vi`: Analytics cookies

**Note:** Only `jobs` and `jssid` appear critical for API functionality.

---

## 📊 Capabilities

The reverse-engineered API client supports:

1. **Search Functionality**
   - Keyword search in job titles/descriptions
   - Filter by location, team, role (structure identified)
   - Sorting options
   - Multi-locale support (en-us, fr-fr, etc.)

2. **Pagination**
   - Manual page-by-page navigation
   - Automatic pagination for bulk fetching
   - Total count retrieval

3. **Data Export**
   - JSON format
   - CSV format (via example code)
   - Structured data classes for easy manipulation

4. **Error Handling**
   - Request failures
   - Token expiration (auto-refresh)
   - Parse errors
   - Rate limiting awareness

---

## 🚀 Next Steps / Potential Enhancements

1. **Filter Discovery**
   - Map out all available location IDs
   - Document team/department IDs
   - Identify role type filters

2. **Job Details Endpoint**
   - Check if individual job detail endpoints exist
   - May require additional HAR captures of job detail pages

3. **Advanced Features**
   - Job change notifications
   - Automated scraping with scheduling
   - Database integration
   - API rate limit detection

4. **Robustness**
   - Retry logic with exponential backoff
   - Connection pooling
   - Response caching

---

## ⚠️ Important Notes

1. **API Stability:** This is a reverse-engineered, unofficial API. Apple may change it at any time.

2. **Rate Limiting:** No explicit rate limits observed, but use responsibly.

3. **Terms of Service:** Ensure compliance with Apple's terms of service when using this client.

4. **CSRF Token Lifespan:** Tokens appear to be session-based. The client handles refresh automatically.

5. **Testing Frequency:** Re-validate the client periodically as the API may change.

---

## 📝 Files Generated

```
scripts/41075dd92a15/
├── api_client.py          # Main API client (497 lines)
├── README.md              # Full documentation (450+ lines)
├── quick_example.py       # Interactive example script (102 lines)
├── requirements.txt       # Python dependencies
└── SUMMARY.md            # This file
```

**Total Lines of Code:** ~1,050 lines of production-ready Python + documentation

---

## ✅ Validation

The client has been tested and verified to:
- Successfully authenticate with CSRF tokens
- Retrieve job listings from Apple's API
- Extract all requested fields (URL, Title, Location, Description)
- Handle pagination correctly
- Parse response data accurately

**Test Output:**
```
✓ Retrieved 20 jobs
✓ Total jobs available: 6,179
✓ All fields extracted successfully
```

---

## 📞 Support

For issues or questions about the reverse-engineered API:
1. Check the README.md for common solutions
2. Capture a new HAR file to verify API changes
3. Review the HAR file analysis in this summary

---

**Generated by:** HAR File Analysis Tool
**Analysis Date:** December 22, 2025
**API Version:** v1 (jobs.apple.com)
