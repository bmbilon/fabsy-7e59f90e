export function validOptionalAptoPhone(value: string) {
  if (!value) return true;
  const digits = value.replace(/\D/g, "").length;
  return /^[0-9+(). -]+$/.test(value) && value.length <= 30 && digits >= 10 &&
    digits <= 15;
}

export function validOptionalAptoProvince(value: string) {
  return value.length <= 80;
}

export function validOptionalAptoPostalCode(value: string) {
  return !value || (
    value.length >= 3 && value.length <= 12 &&
    /^[A-Z0-9][A-Z0-9 -]*[A-Z0-9]$/.test(value)
  );
}
