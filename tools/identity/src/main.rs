use std::path::PathBuf;

use anyhow::Result;
use clap::{Parser, Subcommand};
use polycentric_identity::{default_dir, IdentityStore, KeyKind};

#[derive(Parser)]
#[command(
    name = "polycentric-identity",
    about = "Create and manage a Polycentric identity (rotation + signing keys)"
)]
struct Cli {
    /// Storage directory (default: ~/.polycentric)
    #[arg(long, global = true, value_name = "DIR")]
    dir: Option<PathBuf>,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Create a new identity (generates the primary rotation key)
    Create,
    /// Generate a rotation key and append an identity event adding it
    AddRotationKey,
    /// Generate a signing key and append an identity event adding it
    AddSigningKey,
    /// Revoke a key by its public-key hex (appends a revocation event)
    Revoke {
        /// Public key (hex) of the key to revoke
        public_key: String,
    },
    /// Publish the identity event chain to a Polycentric server
    Publish {
        /// Server URL (e.g. https://srv1.polycentric.io)
        server: String,
    },
    /// Print a private key as hex (defaults to the genesis/primary key)
    PrivateKey {
        /// Public key (hex) whose private key to print; omit for the genesis key
        public_key: Option<String>,
    },
    /// Print the identity, current key set, and event chain
    Show,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let dir = match cli.dir {
        Some(dir) => dir,
        None => default_dir()?,
    };
    let mut store = IdentityStore::open(&dir)?;

    match cli.command {
        Command::Create => {
            let identity = store.create_identity()?;
            println!("Created identity {identity}");
            println!("Stored in {}", dir.display());
        }
        Command::AddRotationKey => {
            let key = store.add_key(KeyKind::Rotation)?;
            println!("Added rotation key {}", key.public_hex());
        }
        Command::AddSigningKey => {
            let key = store.add_key(KeyKind::Signing)?;
            println!("Added signing key {}", key.public_hex());
        }
        Command::Revoke { public_key } => {
            let kind = store.revoke_key(&public_key)?;
            let label = match kind {
                KeyKind::Rotation => "rotation",
                KeyKind::Signing => "signing",
            };
            println!("Revoked {label} key {public_key}");
        }
        Command::Publish { server } => {
            let count = store.publish(&server)?;
            println!("Published {count} identity events to {server}");
        }
        Command::PrivateKey { public_key } => {
            let private = store.private_key(public_key.as_deref())?;
            println!("{}", hex::encode(private));
        }
        Command::Show => {
            println!("Identity: {}", store.identity()?);
            let doc = store.current_doc()?;
            println!("Rotation keys ({}):", doc.rotation_keys.len());
            for key in &doc.rotation_keys {
                println!("  {}", hex::encode(&key.key));
            }
            println!("Signing keys ({}):", doc.signing_keys.len());
            for key in &doc.signing_keys {
                println!("  {}", hex::encode(&key.key));
            }
            let chain = store.chain()?;
            println!("Identity events ({}):", chain.len());
            for entry in &chain {
                let revoked = entry.doc.revocation_bounds.len();
                let note = if revoked > 0 {
                    format!(" ({revoked} revocation(s))")
                } else {
                    String::new()
                };
                println!(
                    "  #{} signed by {}{}",
                    entry.sequence,
                    hex::encode(&entry.signer),
                    note
                );
            }
        }
    }
    Ok(())
}
