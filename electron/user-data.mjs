import {join} from 'node:path';

// O nome comercial mudou em 0.6.1; dados instalados continuam no mesmo diretorio.
// Nunca renomear a pasta legada sem migracao: pode conter SQLite e credenciais LAN.
export function resolveUserDataDirectory(appDataDirectory,defaultUserDataDirectory,exists){
  const oldDirectory=join(appDataDirectory,'PDV SUPER');
  const legacyFiles=['pdv-better.sqlite','terminal-id.txt','lan-settings.json'];
  return legacyFiles.some(filename=>exists(join(oldDirectory,filename)))
    ? oldDirectory
    : defaultUserDataDirectory;
}
