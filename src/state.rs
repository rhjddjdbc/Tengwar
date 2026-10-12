use crate::vim::VimState;
use std::sync::Mutex;

pub struct AppState {
    pub vim: Mutex<VimState>,
}