// Age evaluation
const evaluateAge = (age) => {
  if (age <= 30) return 0;
  if (age > 30 && age <= 45) return 1;
  if (age > 45 && age <= 65) return 2;
  return 3;
};

// BMI evaluation
const evaluateBMI = (height, weight) => {
  if (!height || !weight) return 0;
  const bmi = weight / ((height / 100) * (height / 100));
  
  if (bmi < 18.5) return 1;
  if (bmi >= 618.5 && bmi < 24.9) return 0;
  if (bmi >= 25 && bmi < 29.9) return 1;
  return 2;
};

// Pulse evaluation
const evaluatePulse = (age, pulse) => {
  if ((age >= 12 && age <= 75 && pulse >= 60 && pulse < 100) || (age > 75 && pulse < 90)) return 0;
  if (age >= 5 && age < 12 && pulse >= 60 && pulse < 120) return 0;
  if (age >= 1 && age < 5 && pulse >= 80 && pulse < 150) return 0;
  if (age < 1 && pulse >= 120 && pulse < 150) return 0;
  return 3;
};

// BP evaluation
const evaluateBP = (systolic, diastolic) => {
  let score = 0;
  
  if (systolic) {
    if (systolic > 154) score += 5;
    else if ((systolic > 132 && systolic <= 154) || systolic < 81) score += 3;
  }
  
  if (diastolic) {
    if (diastolic > 99) score += 5;
    else if ((diastolic > 88 && diastolic <= 99) || diastolic < 63) score += 3;
  }
  
  return score;
};

// SpO2 evaluation
const evaluateSpO2 = (spo2) => {
  if (spo2 >= 97 && spo2 <= 100) return 0;
  if (spo2 >= 95 && spo2 < 97) return 3;
  return 5;
};

// Glucose evaluation
const evaluateGlucose = (glucose) => {
  if (!glucose) return 0;
  
  const value = parseFloat(glucose.replace(/[^\d.]/g, ''));
  
  if (glucose.includes('F')) {
    if (value <= 80) return 5;
    if (value > 80 && value <= 100) return 0;
    if (value > 100 && value <= 125) return 3;
    return 5;
  } else if (glucose.includes('PP')) {
    if (value <= 120) return 5;
    if (value > 120 && value <= 170) return 3;
    if (value > 170 && value <= 190) return 0;
    if (value > 190 && value <= 220) return 3;
    return 5;
  } else {
    if (value <= 80) return 5;
    if (value > 80 && value <= 120) return 3;
    if (value > 120 && value <= 140) return 0;
    if (value > 140 && value <= 160) return 3;
    return 5;
  }
};

// Main calculation
export const calculateVitalsRiskScore = (patientData, vitalsData) => {
  let totalScore = 0;
  
  totalScore += evaluateAge(patientData.age);
  totalScore += evaluateBMI(vitalsData.height, vitalsData.weight);
  
  if (vitalsData.systolic || vitalsData.diastolic) {
    totalScore += evaluateBP(vitalsData.systolic, vitalsData.diastolic);
  }
  if (vitalsData.spo2) totalScore += evaluateSpO2(vitalsData.spo2);
  if (vitalsData.bloodGlucose) totalScore += evaluateGlucose(vitalsData.bloodGlucose);
  
  return totalScore;
};

// Determine vital risk level
export const determineVitalRiskLevel = (vitalScore) => {
  if (vitalScore < 33) return 'Low';
  if (vitalScore >= 33 && vitalScore < 66) return 'Moderate';
  return 'High';
};