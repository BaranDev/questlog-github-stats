use crate::canvas::Image;
use crate::card::Card;
use crate::stats::UserStats;
use crate::widgets::Look;

pub fn render(c: Card, _look: &Look, _s: &UserStats) -> Vec<Image> {
    vec![c.frame()]
}
