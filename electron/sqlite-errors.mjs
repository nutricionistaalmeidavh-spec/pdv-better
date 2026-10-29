// Tradutor único de falhas de armazenamento. Nunca encobrir o erro original
// e nunca trocar o banco por um snapshot vazio após uma falha de escrita.
export function normalizeSqliteError(error){
  const message=String(error?.message||error||'');
  if(/SQLITE_BUSY|SQLITE_LOCKED|database is locked|database is busy/i.test(message))
    return new Error('O banco SQLite está ocupado ou bloqueado. Aguarde e tente novamente.',{cause:error});
  if(/SQLITE_FULL|ENOSPC|database or disk is full|no space left on device/i.test(message))
    return new Error('Espaço insuficiente no disco para gravar o PDV. Libere espaço e tente novamente; os dados anteriores foram preservados.',{cause:error});
  if(/SQLITE_CORRUPT|SQLITE_NOTADB|file is not a database|database disk image is malformed|malformed database schema|integridade/i.test(message))
    return new Error('Integridade do banco SQLite inválida ou dados corrompidos. Não foi criado um banco vazio.',{cause:error});
  return error;
}
