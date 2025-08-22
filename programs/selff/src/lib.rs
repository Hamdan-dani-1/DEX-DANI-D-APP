use anchor_lang::prelude::*;

declare_id!("Ei59ErEipxrfh6bJkdXNHFxyE2YKsbpcj1ZQfBFHTWY6");

#[program]
pub mod proj {
    use super::*;

    // ---------------- REGISTER ----------------
    pub fn register(
        ctx: Context<Register>,
        name: String,
        email: String,
        password: String,
    ) -> Result<()> {   
        let userdata = &mut ctx.accounts.userdata;
        userdata.name = name;
        userdata.email = email;
        userdata.pass = password;
        userdata.bump = ctx.bumps.userdata;
        userdata.owner = ctx.accounts.payer.key();
        Ok(())
    }

    // ---------------- LOGIN ----------------
    pub fn login(
        ctx: Context<Login>,
        name: String,
        password: String,
    ) -> Result<()> {
        let userdata = &ctx.accounts.userdata;

        require!(
            userdata.name == name && userdata.pass == password,
            CustomError::InvalidCredentials
        );

        msg!("✅ Login success for {}", name);
        Ok(())
    }

    // ---------------- TRANSFER ----------------
    pub fn transfer(
        ctx: Context<Transfer>,
        amount: u64,
    ) -> Result<()> {
        let from_user = &ctx.accounts.from_user;
        let recipient = &ctx.accounts.recipient;

        // Verify that the signer is authorized
        require!(
            ctx.accounts.payer.key() == from_user.owner,
            CustomError::UnauthorizedTransfer
        );

        // Verify minimum balance (keep some for rent exemption)
        let from_balance = from_user.to_account_info().lamports();
        let rent_minimum = Rent::get()?.minimum_balance(from_user.to_account_info().data_len());
        
        require!(
            from_balance > amount + rent_minimum,
            CustomError::InsufficientFunds
        );

        // Transfer SOL from the PDA to recipient
        **from_user.to_account_info().try_borrow_mut_lamports()? -= amount;
        **recipient.to_account_info().try_borrow_mut_lamports()? += amount;

        msg!("✅ Transferred {} lamports from {} to {}", 
             amount, 
             from_user.key(), 
             recipient.key());

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(name: String)]
pub struct Register<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + UserData::MAX_SIZE,
        seeds = [b"user", payer.key().as_ref(), name.as_bytes()],
        bump
    )]
    pub userdata: Account<'info, UserData>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(name: String)]
pub struct Login<'info> {
    #[account(
        seeds = [b"user", payer.key().as_ref(), name.as_bytes()],
        bump = userdata.bump
    )]
    pub userdata: Account<'info, UserData>,

    pub payer: Signer<'info>,
}

#[derive(Accounts)]
pub struct Transfer<'info> {
    #[account(
        mut,
        seeds = [b"user", from_user.owner.as_ref(), from_user.name.as_bytes()],
        bump = from_user.bump
    )]
    pub from_user: Account<'info, UserData>,

    /// CHECK: This can be any wallet or PDA, no constraints needed
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct UserData {
    pub name: String,
    pub email: String,
    pub pass: String,
    pub bump: u8,
    pub owner: Pubkey,
}

impl UserData {
    pub const MAX_SIZE: usize = 4 + 50   // name (4 bytes length + 50 chars)
                               + 4 + 50   
                               + 4 + 50   
                               + 1       
                               + 32;      
}

#[error_code]
pub enum CustomError {
    #[msg("❌ Invalid credentials")]
    InvalidCredentials,
    #[msg("❌ Unauthorized transfer")]
    UnauthorizedTransfer,
    #[msg("❌ Insufficient funds for transfer")]
    InsufficientFunds,
}