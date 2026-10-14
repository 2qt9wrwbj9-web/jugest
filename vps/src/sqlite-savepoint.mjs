// Composable synchronous transactions, including callers already in BEGIN IMMEDIATE.
export function withSavepoint(db,name,operation){
  if(!/^[a-z_]+$/.test(name))throw new TypeError('invalid savepoint name');
  db.exec(`SAVEPOINT ${name}`);
  try{const result=operation();db.exec(`RELEASE ${name}`);return result}
  catch(error){try{db.exec(`ROLLBACK TO ${name}`);db.exec(`RELEASE ${name}`)}catch{}throw error}
}
