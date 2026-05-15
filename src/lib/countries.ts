export interface Country {
  code: string;
  name: string;
  dial: string;
  flag: string;
}

export const COUNTRIES: Country[] = [
  { code: 'BR', name: 'Brasil', dial: '55', flag: '🇧🇷' },
  { code: 'PT', name: 'Portugal', dial: '351', flag: '🇵🇹' },
  { code: 'US', name: 'Estados Unidos', dial: '1', flag: '🇺🇸' },
  { code: 'CA', name: 'Canadá', dial: '1', flag: '🇨🇦' },
  { code: 'MX', name: 'México', dial: '52', flag: '🇲🇽' },
  { code: 'AR', name: 'Argentina', dial: '54', flag: '🇦🇷' },
  { code: 'CL', name: 'Chile', dial: '56', flag: '🇨🇱' },
  { code: 'CO', name: 'Colômbia', dial: '57', flag: '🇨🇴' },
  { code: 'PE', name: 'Peru', dial: '51', flag: '🇵🇪' },
  { code: 'UY', name: 'Uruguai', dial: '598', flag: '🇺🇾' },
  { code: 'PY', name: 'Paraguai', dial: '595', flag: '🇵🇾' },
  { code: 'BO', name: 'Bolívia', dial: '591', flag: '🇧🇴' },
  { code: 'VE', name: 'Venezuela', dial: '58', flag: '🇻🇪' },
  { code: 'EC', name: 'Equador', dial: '593', flag: '🇪🇨' },
  { code: 'ES', name: 'Espanha', dial: '34', flag: '🇪🇸' },
  { code: 'GB', name: 'Reino Unido', dial: '44', flag: '🇬🇧' },
  { code: 'FR', name: 'França', dial: '33', flag: '🇫🇷' },
  { code: 'IT', name: 'Itália', dial: '39', flag: '🇮🇹' },
  { code: 'DE', name: 'Alemanha', dial: '49', flag: '🇩🇪' },
  { code: 'NL', name: 'Holanda', dial: '31', flag: '🇳🇱' },
  { code: 'CH', name: 'Suíça', dial: '41', flag: '🇨🇭' },
  { code: 'IE', name: 'Irlanda', dial: '353', flag: '🇮🇪' },
  { code: 'AO', name: 'Angola', dial: '244', flag: '🇦🇴' },
  { code: 'MZ', name: 'Moçambique', dial: '258', flag: '🇲🇿' },
  { code: 'CV', name: 'Cabo Verde', dial: '238', flag: '🇨🇻' },
  { code: 'AU', name: 'Austrália', dial: '61', flag: '🇦🇺' },
  { code: 'JP', name: 'Japão', dial: '81', flag: '🇯🇵' },
  { code: 'CN', name: 'China', dial: '86', flag: '🇨🇳' },
  { code: 'IN', name: 'Índia', dial: '91', flag: '🇮🇳' },
];

export const DEFAULT_COUNTRY_CODE = 'BR';

export const getCountry = (code: string): Country =>
  COUNTRIES.find((c) => c.code === code) || COUNTRIES[0];
