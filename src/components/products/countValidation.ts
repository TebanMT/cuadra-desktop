export const validCount = (value: string) => /^(0|[1-9]\d*)$/.test(value) && Number(value) <= 1000000;
