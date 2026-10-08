export const totalHours = (minutes: number[]) => {
  const hours = minutes.reduce((sum, m) => sum + m, 0) / 60;

  return Math.round(hours * 10) / 10;
};

export const totalLabel = (hours: number) => hours.toFixed(1);
