# Test Reports Directory

This directory contains generated test reports from the 12-week comprehensive testing framework.

## Generated Files

After running `npm run test:comprehensive`, you'll find 5 files with timestamps:

### 1. summary_[timestamp].csv
Quick overview of all 10 test users
- Demographics and risk factors
- Score progression
- Risk distribution
- Adherence quality
- Baseline metrics
- Data completeness

### 2. observations_[timestamp].csv
Detailed observations organized by category
- Overall Performance
- Risk Profile
- Trend Analysis
- Adherence Quality
- Health Status
- Baseline Progression
- Resting Heart Rate
- Data Quality
- Risk Factors
- Weekly Consistency
- Milestones & Concerns

### 3. weekly_progression_[timestamp].csv
Week-by-week scores for visualization
- 12 columns (one per week)
- Perfect for creating line charts
- Shows trends over time

### 4. session_details_[timestamp].csv
Complete session-level data (360 rows)
- All session metrics
- HR data
- Risk levels
- Health status
- Data completeness per session

### 5. EXECUTIVE_SUMMARY_[timestamp].txt
Comprehensive text report
- Overall statistics
- Individual user summaries
- All key observations
- Ready for presentations

## Usage

### Import to Excel
1. Open Excel
2. Data → Get Data → From Text/CSV
3. Select file → Load

### Create Charts
- Line Chart: Use weekly_progression for trends
- Bar Chart: Use summary for comparisons
- Pie Chart: Use risk distribution columns

### Pivot Tables
Use session_details for detailed analysis:
- Risk distribution by week
- Health status patterns
- Data completeness impact

## Files Location

All reports are in: `/root/backendv2/backend_krea/test-reports/`

Latest run: 2025-11-12T06-43-45
