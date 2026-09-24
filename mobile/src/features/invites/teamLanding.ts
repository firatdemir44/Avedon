// Ekip arkadaşı davetiyle kayıt bitince kişi firmasının sayfasına (Kişiler sekmesi) düşsün.
// Kayıt ekranı firmayı buraya yazar; oturum açılınca RootNavigator bir kez okuyup gider.
let pendingCompanyId: string | null = null;

export function setTeamLanding(companyId: string | null) {
  pendingCompanyId = companyId;
}

export function takeTeamLanding(): string | null {
  const id = pendingCompanyId;
  pendingCompanyId = null;
  return id;
}
