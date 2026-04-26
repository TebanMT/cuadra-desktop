use keyring::Entry;

const SERVICE: &str = "app.cuadra.desktop";

#[derive(thiserror::Error, Debug)]
pub enum Error {
    #[error("keyring error: {0}")]
    Keyring(#[from] keyring::Error),
}

fn entry(key: &str) -> Result<Entry, Error> {
    Ok(Entry::new(SERVICE, key)?)
}

pub fn set(key: &str, value: &str) -> Result<(), Error> {
    entry(key)?.set_password(value)?;
    Ok(())
}

pub fn get(key: &str) -> Result<Option<String>, Error> {
    match entry(key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn delete(key: &str) -> Result<(), Error> {
    match entry(key)?.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}
