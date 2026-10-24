/*
 * Cupid's knowledge base.
 *
 * cuisines: a family tree. Leaves are what foods belong to; groups (Asian,
 *   Southeast Asian, ...) let Cupid ask broad questions and let a "maybe"
 *   spread to neighbouring cuisines.
 * traits: yes/no/maybe questions about the dish itself.
 * foods: each has space-separated `cuisine` and `tags`. A trailing ~ means
 *   "sometimes / partly" (e.g. `veg~` = easy to get vegetarian).
 *   `wiki` is the Wikipedia article whose photo is shown for the dish.
 *   `search` is what to look up when finding restaurants (defaults to the name).
 *   `osm` (on foods and cuisines) lists OpenStreetMap cuisine= values, used to
 *   find restaurants when no Google key is set up.
 *
 * To add a food, copy an entry and run `npm run simulate` to check that Cupid
 * can still tell everything apart.
 */
(function (root) {
  const data = {
    cuisines: {
      asian: { name: 'Asian', emoji: '🥢' },
      'east-asian': { name: 'East Asian', parent: 'asian', emoji: '🏮' },
      chinese: { name: 'Chinese', parent: 'east-asian', emoji: '🥟', osm: 'chinese|cantonese|sichuan|szechuan|dim_sum|dumpling|hot_pot|shanghai|hunan' },
      japanese: { name: 'Japanese', parent: 'east-asian', emoji: '🍣', osm: 'japanese|sushi|ramen|udon|izakaya|donburi|yakitori' },
      korean: { name: 'Korean', parent: 'east-asian', emoji: '🥘', osm: 'korean' },
      taiwanese: { name: 'Taiwanese', parent: 'east-asian', emoji: '🧋', osm: 'taiwanese' },
      'southeast-asian': { name: 'Southeast Asian', parent: 'asian', emoji: '🌴' },
      thai: { name: 'Thai', parent: 'southeast-asian', emoji: '🥥', osm: 'thai' },
      vietnamese: { name: 'Vietnamese', parent: 'southeast-asian', emoji: '🍜', osm: 'vietnamese|pho' },
      filipino: { name: 'Filipino', parent: 'southeast-asian', emoji: '🍗', osm: 'filipino' },
      malaysian: { name: 'Malaysian & Singaporean', parent: 'southeast-asian', phrase: 'Malaysian or Singaporean food', adj: 'Malaysian', emoji: '🍤', osm: 'malaysian|singaporean|indonesian' },
      indian: { name: 'Indian', parent: 'asian', emoji: '🍛', osm: 'indian|south_indian|north_indian|pakistani|nepalese|punjabi' },
      'asian-fusion': { name: 'Asian fusion', parent: 'asian', phrase: 'Asian fusion', adj: 'fusion', emoji: '🥡', osm: 'asian|fusion|asian_fusion' },

      latin: { name: 'Latin American', emoji: '🌶️' },
      mexican: { name: 'Mexican', parent: 'latin', emoji: '🌮', osm: 'mexican|tex-mex|taco|burrito' },
      peruvian: { name: 'Peruvian', parent: 'latin', emoji: '🍋', osm: 'peruvian' },
      caribbean: { name: 'Caribbean', parent: 'latin', emoji: '🌴', osm: 'caribbean|jamaican|cuban|puerto_rican|dominican|haitian' },
      salvadoran: { name: 'Salvadoran', parent: 'latin', emoji: '🫓', osm: 'salvadoran|latin_american' },

      european: { name: 'European', emoji: '🥖' },
      italian: { name: 'Italian', parent: 'european', emoji: '🍝', osm: 'italian|pizza|pasta' },
      french: { name: 'French', parent: 'european', emoji: '🥐', osm: 'french|crepe|bistro' },
      spanish: { name: 'Spanish', parent: 'european', emoji: '🥘', osm: 'spanish|tapas' },
      british: { name: 'British', parent: 'european', phrase: 'British pub food', emoji: '🐟', osm: 'british|fish_and_chips|english|irish' },

      mediterranean: { name: 'Mediterranean & Middle Eastern', phrase: 'Mediterranean or Middle Eastern food', adj: 'Mediterranean', emoji: '🫒' },
      greek: { name: 'Greek', parent: 'mediterranean', emoji: '🥙', osm: 'greek' },
      'middle-eastern': { name: 'Middle Eastern', parent: 'mediterranean', emoji: '🧆', osm: 'lebanese|middle_eastern|turkish|kebab|persian|falafel|israeli|arab|mediterranean' },

      american: { name: 'American', emoji: '🍔' },
      'classic-american': { name: 'Classic American', parent: 'american', phrase: 'classic American food', adj: 'American', emoji: '🍔', osm: 'american|burger|sandwich|diner|hot_dog|deli' },
      southern: { name: 'Southern & BBQ', parent: 'american', phrase: 'Southern food or BBQ', adj: 'Southern', emoji: '🍖', osm: 'bbq|barbecue|southern|cajun|creole|soul_food|chicken' },
      hawaiian: { name: 'Hawaiian', parent: 'american', emoji: '🌺', osm: 'hawaiian|poke' },

      ethiopian: { name: 'Ethiopian', emoji: '🍲', osm: 'ethiopian|eritrean' },
    },

    // yesFloor / noFloor: how much a "yes" or "no" still allows dishes that
    // don't fit. Higher = softer question. weight: how keen Cupid is to ask it.
    traits: {
      noodles: { label: 'Noodles', emoji: '🍜', q: 'Are you in the mood for noodles or pasta?', qc: 'Are you feeling {adj} noodles?' },
      rice: { label: 'Rice', emoji: '🍚', q: 'Do you want something with rice?' },
      soup: { label: 'Soupy', emoji: '🍲', q: 'Something brothy — a soup or a stew?', qc: 'How about a {adj} soup or stew?' },
      bread: { label: 'Bready', emoji: '🥪', q: 'Craving something on bread — a sandwich, burger, bun, or pita?' },
      handheld: { label: 'Handheld', emoji: '🙌', q: 'Do you want something you can eat with your hands?', noFloor: 0.12 },
      fried: { label: 'Fried', emoji: '🍤', q: 'Are you craving something fried and crispy?' },
      grilled: { label: 'Grilled', emoji: '🔥', q: 'Something grilled, smoky, or charred?' },
      wok: { label: 'Stir-fried', emoji: '🥘', q: 'How about something stir-fried in a hot wok?' },
      spicy: { label: 'Spicy', emoji: '🌶️', q: 'Do you want some heat — something spicy?', yesFloor: 0.08, noFloor: 0.08 },
      seafood: { label: 'Seafood', emoji: '🦐', q: 'Are you in the mood for seafood?' },
      meat: { label: 'Meaty', emoji: '🥩', q: 'Do you want something meat-forward?', yesFloor: 0.12, noFloor: 0.12, weight: 0.8 },
      veg: { label: 'Vegetarian', emoji: '🥦', q: 'Are you looking for something vegetarian?', yesFloor: 0.03, noFloor: 0.6, weight: 0.8 },
      raw: { label: 'Raw fish', emoji: '🍣', q: 'Are you up for raw fish — sushi, poke, or ceviche?' },
      curry: { label: 'Curry', emoji: '🍛', q: 'Are you in the mood for curry?', qc: 'Is it a {adj} curry you\'re after?' },
      dumplings: { label: 'Dumplings', emoji: '🥟', q: 'Are you craving dumplings?' },
      cheesy: { label: 'Cheesy', emoji: '🧀', q: 'Are you craving something cheesy?' },
      cold: { label: 'Cool & fresh', emoji: '🥒', q: 'Would something cool and fresh (not piping hot) hit the spot?', yesFloor: 0.1, noFloor: 0.15, weight: 0.7 },
      healthy: { label: 'Light', emoji: '🥗', q: 'Trying to keep it light and healthy?', yesFloor: 0.12, noFloor: 0.25, weight: 0.75 },
      hearty: { label: 'Hearty', emoji: '🍖', q: 'Do you want something hearty and filling — real comfort food?', yesFloor: 0.15, noFloor: 0.2, weight: 0.7 },
      quick: { label: 'Quick', emoji: '⚡', q: 'In a rush — need something quick?', yesFloor: 0.2, noFloor: 0.45, weight: 0.5 },
      cheap: { label: 'Budget', emoji: '💸', q: 'Keeping it budget-friendly today?', yesFloor: 0.2, noFloor: 0.45, weight: 0.5 },
      group: { label: 'Sharing', emoji: '👯', q: 'Eating with a group and want something to share?', yesFloor: 0.3, noFloor: 0.3, weight: 0.55 },
    },

    foods: [
      // Thai
      { id: 'pad-thai', name: 'Pad Thai', emoji: '🍜', cuisine: 'thai', pop: 1.4, wiki: 'Pad thai', tags: 'noodles wok cheap quick~ veg~ seafood~', desc: 'Sweet-tangy stir-fried rice noodles with egg, tamarind, and crushed peanuts.' },
      { id: 'pad-see-ew', name: 'Pad See Ew', emoji: '🥢', cuisine: 'thai', wiki: 'Pad see ew', tags: 'noodles wok cheap hearty~ veg~ meat~', desc: 'Wide, smoky rice noodles stir-fried with sweet soy, egg, and Chinese broccoli.' },
      { id: 'drunken-noodles', name: 'Drunken Noodles', emoji: '🌶️', cuisine: 'thai', search: 'pad kee mao', wiki: 'Drunken noodles', tags: 'noodles wok spicy meat~ veg~', desc: 'Pad kee mao — wide noodles wok-tossed with chilies and holy basil. Brings the heat.' },
      { id: 'green-curry', name: 'Green Curry', emoji: '🍛', cuisine: 'thai', search: 'thai green curry', wiki: 'Green curry', tags: 'curry rice spicy veg~ meat~', desc: 'Fragrant coconut curry with Thai basil and green chilies, over jasmine rice.' },
      { id: 'panang-curry', name: 'Panang Curry', emoji: '🥥', cuisine: 'thai', wiki: 'Phanaeng', tags: 'curry rice hearty meat', desc: 'Rich, nutty, mild red curry with thick coconut cream — cozy and saucy.' },
      { id: 'tom-yum', name: 'Tom Yum Soup', emoji: '🍲', cuisine: 'thai', wiki: 'Tom yum', tags: 'soup spicy seafood healthy', desc: 'Hot-and-sour lemongrass broth with shrimp, mushrooms, and lime.' },
      { id: 'khao-soi', name: 'Khao Soi', emoji: '🍜', cuisine: 'thai', wiki: 'Khao soi', tags: 'curry noodles soup hearty spicy~ meat~', desc: 'Northern Thai coconut curry noodle soup, crowned with crispy fried noodles.' },
      { id: 'pad-kra-pao', name: 'Thai Basil Chicken', emoji: '🍳', cuisine: 'thai', search: 'pad kra pao', wiki: 'Phat kaphrao', tags: 'rice wok spicy meat quick cheap', desc: 'Pad kra pao — spicy holy-basil stir-fry over rice with a crispy fried egg.' },
      { id: 'som-tum', name: 'Papaya Salad (Som Tum)', emoji: '🥗', cuisine: 'thai', search: 'som tum', wiki: 'Som tam', tags: 'healthy cold spicy cheap veg~', desc: 'Green papaya pounded with chili, lime, and fish sauce. Crunchy and fiery.' },

      // Vietnamese
      { id: 'pho', name: 'Pho', emoji: '🍜', cuisine: 'vietnamese', pop: 1.4, wiki: 'Pho', osm: 'pho', tags: 'noodles soup meat cheap healthy~ hearty~', desc: 'Slow-simmered beef broth with rice noodles, fresh herbs, and lime.' },
      { id: 'banh-mi', name: 'Bánh Mì', emoji: '🥖', cuisine: 'vietnamese', search: 'banh mi', pop: 1.2, wiki: 'Bánh mì', osm: 'banh_mi', tags: 'bread handheld quick cheap meat grilled~ cold~ spicy~', desc: 'Crackly baguette with grilled pork, pâté, pickled veggies, and jalapeño.' },
      { id: 'bun-bo-hue', name: 'Bún Bò Huế', emoji: '🌶️', cuisine: 'vietnamese', search: 'bun bo hue', wiki: 'Bún bò Huế', tags: 'noodles soup spicy meat hearty', desc: 'Spicy lemongrass beef noodle soup from central Vietnam.' },
      { id: 'bun', name: 'Vermicelli Bowl (Bún)', emoji: '🥗', cuisine: 'vietnamese', search: 'bun thit nuong', wiki: 'Bún thịt nướng', tags: 'noodles grilled healthy cold meat~ fried~', desc: 'Cool rice vermicelli with grilled pork, herbs, egg rolls, and nước chấm.' },
      { id: 'com-tam', name: 'Broken Rice (Cơm Tấm)', emoji: '🍚', cuisine: 'vietnamese', search: 'com tam', wiki: 'Cơm tấm', tags: 'rice grilled meat cheap hearty~', desc: 'Grilled lemongrass pork chop over broken rice with a fried egg.' },
      { id: 'goi-cuon', name: 'Fresh Spring Rolls', emoji: '🌯', cuisine: 'vietnamese', search: 'goi cuon spring rolls', wiki: 'Gỏi cuốn', tags: 'healthy cold handheld quick~ seafood~ veg~', desc: 'Rice paper rolls with shrimp, herbs, and vermicelli, dunked in peanut sauce.' },

      // Chinese
      { id: 'dim-sum', name: 'Dim Sum', emoji: '🥟', cuisine: 'chinese', pop: 1.2, wiki: 'Dim sum', osm: 'dim_sum|cantonese', tags: 'dumplings group seafood~ fried~ handheld~', desc: 'Har gow, siu mai, buns, and turnip cakes rolling by on carts — made for sharing.' },
      { id: 'xiao-long-bao', name: 'Soup Dumplings (Xiao Long Bao)', emoji: '🥟', cuisine: 'chinese taiwanese~', search: 'xiao long bao', wiki: 'Xiaolongbao', osm: 'dumpling|shanghai', tags: 'dumplings meat soup~', desc: 'Delicate pleated dumplings filled with pork and hot broth. Slurp carefully.' },
      { id: 'hand-pulled-noodles', name: 'Hand-Pulled Noodles', emoji: '🍜', cuisine: 'chinese', wiki: 'Lamian', osm: 'noodle|lanzhou', tags: 'noodles hearty cheap spicy~ soup~ meat~', desc: 'Chewy, fresh-pulled noodles in beef broth or tossed in chili oil.' },
      { id: 'mapo-tofu', name: 'Mapo Tofu', emoji: '🌶️', cuisine: 'chinese', search: 'sichuan restaurant', wiki: 'Mapo tofu', osm: 'sichuan|szechuan', tags: 'spicy rice veg~ hearty~ wok~', desc: 'Sichuan silken tofu in a numbing, fiery chili-bean sauce over rice.' },
      { id: 'hot-pot', name: 'Hot Pot', emoji: '🍲', cuisine: 'chinese taiwanese~', wiki: 'Hot pot', osm: 'hot_pot', tags: 'soup group meat hearty spicy~ seafood~', desc: 'A bubbling pot of broth at the table — cook your own meats, veggies, and noodles.' },
      { id: 'chinese-takeout', name: 'Chinese Takeout', emoji: '🥡', cuisine: 'chinese classic-american~', pop: 1.3, search: 'chinese takeout', wiki: 'Orange chicken', tags: 'fried wok rice hearty quick cheap meat noodles~', desc: 'Orange chicken, lo mein, fried rice — the comforting American-Chinese classics.' },
      { id: 'roast-duck', name: 'Roast Duck & Char Siu', emoji: '🦆', cuisine: 'chinese', search: 'cantonese bbq roast duck', wiki: 'Siu mei', osm: 'cantonese', tags: 'meat rice grilled~ cheap~', desc: 'Cantonese BBQ — glossy roast duck and sweet barbecued pork over rice.' },
      { id: 'potstickers', name: 'Potstickers', emoji: '🥟', cuisine: 'chinese', search: 'dumplings', wiki: 'Jiaozi', osm: 'dumpling', tags: 'dumplings cheap fried~ handheld~ quick~ meat~ veg~', desc: 'Pan-fried dumplings with crispy bottoms and a soy-vinegar dip.' },
      { id: 'congee', name: 'Congee', emoji: '🥣', cuisine: 'chinese', wiki: 'Congee', osm: 'cantonese', tags: 'rice soup cheap healthy~ hearty~', desc: 'Silky rice porridge with toppings like pork, century egg, or fried dough.' },

      // Taiwanese
      { id: 'beef-noodle-soup', name: 'Taiwanese Beef Noodle Soup', emoji: '🍜', cuisine: 'taiwanese', wiki: 'Beef noodle soup', osm: 'noodle', tags: 'noodles soup meat hearty spicy~', desc: 'Braised beef shank and chewy noodles in a deep, spiced broth.' },
      { id: 'popcorn-chicken', name: 'Taiwanese Popcorn Chicken', emoji: '🍗', cuisine: 'taiwanese', wiki: 'Taiwanese fried chicken', osm: 'bubble_tea', tags: 'fried handheld quick cheap meat spicy~', desc: 'Crispy salt-and-pepper fried chicken bites with fried basil. Boba optional.' },
      { id: 'lu-rou-fan', name: 'Braised Pork Rice (Lu Rou Fan)', emoji: '🍚', cuisine: 'taiwanese', search: 'lu rou fan', wiki: 'Braised pork rice', tags: 'rice meat hearty cheap quick~', desc: 'Soy-braised minced pork belly spooned over rice. Ultimate comfort.' },
      { id: 'gua-bao', name: 'Gua Bao', emoji: '🫓', cuisine: 'taiwanese', search: 'bao buns', wiki: 'Gua bao', tags: 'bread handheld meat quick~', desc: 'Fluffy steamed buns stuffed with braised pork belly, peanuts, and cilantro.' },

      // Japanese
      { id: 'sushi', name: 'Sushi', emoji: '🍣', cuisine: 'japanese', pop: 1.4, wiki: 'Sushi', osm: 'sushi', tags: 'raw seafood rice cold healthy group~', desc: 'Nigiri and rolls — fresh fish over seasoned rice.' },
      { id: 'ramen', name: 'Ramen', emoji: '🍜', cuisine: 'japanese', pop: 1.4, wiki: 'Ramen', osm: 'ramen', tags: 'noodles soup hearty meat~ spicy~', desc: 'Rich tonkotsu, shoyu, or miso broth with springy noodles and a jammy egg.' },
      { id: 'udon', name: 'Udon & Tempura', emoji: '🍤', cuisine: 'japanese', search: 'udon', wiki: 'Udon', osm: 'udon', tags: 'noodles soup fried~ veg~ seafood~ hearty~', desc: 'Thick, bouncy noodles in dashi broth with crispy tempura on the side.' },
      { id: 'katsu-curry', name: 'Katsu Curry', emoji: '🍛', cuisine: 'japanese', wiki: 'Japanese curry', tags: 'curry fried rice hearty meat', desc: 'Crispy panko cutlet with mellow, sweet Japanese curry over rice.' },
      { id: 'donburi', name: 'Donburi (Rice Bowls)', emoji: '🍚', cuisine: 'japanese', search: 'donburi', wiki: 'Donburi', tags: 'rice meat quick cheap hearty~', desc: 'Gyudon, oyakodon, or katsudon — savory toppings over a big bowl of rice.' },
      { id: 'yakitori', name: 'Yakitori & Izakaya', emoji: '🍢', cuisine: 'japanese', search: 'izakaya', wiki: 'Yakitori', osm: 'yakitori|izakaya', tags: 'grilled meat group handheld~', desc: 'Charcoal-grilled skewers and small plates, best with friends.' },

      // Korean
      { id: 'kbbq', name: 'Korean BBQ', emoji: '🥩', cuisine: 'korean', pop: 1.2, wiki: 'Korean barbecue', osm: 'korean_barbecue', tags: 'grilled meat group hearty', desc: 'Grill-it-yourself galbi and pork belly with endless banchan.' },
      { id: 'bibimbap', name: 'Bibimbap', emoji: '🍚', cuisine: 'korean', wiki: 'Bibimbap', tags: 'rice healthy~ veg~ spicy~ meat~', desc: 'Rice topped with veggies, beef, a fried egg, and gochujang — mix it all up.' },
      { id: 'kfc', name: 'Korean Fried Chicken', emoji: '🍗', cuisine: 'korean', wiki: 'Korean fried chicken', tags: 'fried handheld meat group~ spicy~', desc: 'Double-fried, shatteringly crispy wings glazed sweet-spicy or soy-garlic.' },
      { id: 'soondubu', name: 'Soft Tofu Stew', emoji: '🍲', cuisine: 'korean', search: 'soondubu', wiki: 'Sundubu-jjigae', tags: 'soup spicy hearty~ seafood~ veg~ rice~', desc: 'Sundubu jjigae — bubbling, spicy silken tofu stew with seafood or pork.' },
      { id: 'tteokbokki', name: 'Tteokbokki', emoji: '🌶️', cuisine: 'korean', wiki: 'Tteok-bokki', tags: 'spicy cheap quick~ cheesy~ veg~', desc: 'Chewy rice cakes in a sweet, fiery gochujang sauce. Add cheese.' },
      { id: 'kimbap', name: 'Kimbap', emoji: '🍙', cuisine: 'korean', wiki: 'Gimbap', tags: 'rice cold handheld quick cheap healthy~ meat~ veg~', desc: 'Seaweed rice rolls packed with veggies, egg, and bulgogi — great on the go.' },

      // Filipino
      { id: 'adobo', name: 'Chicken Adobo', emoji: '🍗', cuisine: 'filipino', search: 'filipino restaurant', wiki: 'Filipino cuisine', tags: 'rice meat hearty cheap', desc: 'Chicken braised in vinegar, soy, garlic, and bay leaf, over rice.' },
      { id: 'sisig', name: 'Sizzling Sisig', emoji: '🍳', cuisine: 'filipino', search: 'sisig', wiki: 'Sisig', tags: 'meat fried~ grilled~ spicy~ rice~ group~', desc: 'Crispy chopped pork on a sizzling plate with chili, onion, and calamansi.' },
      { id: 'lumpia', name: 'Lumpia', emoji: '🌯', cuisine: 'filipino', wiki: 'Lumpia', tags: 'fried handheld cheap quick~ meat~ group~', desc: 'Crispy Filipino spring rolls stuffed with seasoned pork and veggies.' },
      { id: 'pancit', name: 'Pancit', emoji: '🍜', cuisine: 'filipino', wiki: 'Pancit', tags: 'noodles wok cheap group~ meat~ veg~', desc: 'Stir-fried noodles with veggies and meat — a party staple.' },

      // Malaysian & Singaporean
      { id: 'laksa', name: 'Laksa', emoji: '🍜', cuisine: 'malaysian', wiki: 'Laksa', tags: 'noodles soup curry spicy seafood', desc: 'Spicy coconut curry noodle soup loaded with shrimp and tofu puffs.' },
      { id: 'chicken-rice', name: 'Hainanese Chicken Rice', emoji: '🐔', cuisine: 'malaysian', wiki: 'Hainanese chicken rice', tags: 'rice meat cheap healthy~', desc: 'Silky poached chicken with fragrant garlic-ginger rice and chili sauce.' },
      { id: 'nasi-lemak', name: 'Nasi Lemak', emoji: '🍛', cuisine: 'malaysian', wiki: 'Nasi lemak', tags: 'rice spicy fried~ meat~ hearty~', desc: 'Coconut rice with sambal, crispy anchovies, peanuts, egg, and fried chicken.' },

      // Indian
      { id: 'butter-chicken', name: 'Butter Chicken', emoji: '🍛', cuisine: 'indian', pop: 1.3, wiki: 'Butter chicken', tags: 'curry meat hearty rice~ bread~', desc: 'Tender chicken in a creamy tomato-butter sauce, with naan for scooping.' },
      { id: 'biryani', name: 'Biryani', emoji: '🍚', cuisine: 'indian', wiki: 'Biryani', tags: 'rice hearty spicy~ meat~', desc: 'Fragrant layered rice with spiced meat, saffron, and fried onions.' },
      { id: 'chana-masala', name: 'Chana Masala', emoji: '🫘', cuisine: 'indian', search: 'indian restaurant', wiki: 'Chana masala', tags: 'curry veg cheap healthy~ spicy~', desc: 'Chickpeas in a tangy, spiced tomato-onion gravy.' },
      { id: 'palak-paneer', name: 'Palak Paneer', emoji: '🥬', cuisine: 'indian', search: 'indian restaurant', wiki: 'Palak paneer', tags: 'curry veg cheesy~ hearty~ healthy~', desc: 'Soft paneer cheese in a velvety spiced spinach sauce.' },
      { id: 'tandoori', name: 'Tandoori Chicken & Naan', emoji: '🔥', cuisine: 'indian', search: 'tandoori', wiki: 'Tandoori chicken', tags: 'grilled meat bread~ spicy~ healthy~', desc: 'Yogurt-marinated chicken charred in a clay oven, with warm garlic naan.' },
      { id: 'dosa', name: 'Masala Dosa', emoji: '🫓', cuisine: 'indian', search: 'dosa', wiki: 'Masala dosa', osm: 'south_indian', tags: 'veg cheap fried~ spicy~', desc: 'A giant crispy rice-lentil crêpe stuffed with spiced potatoes, with sambar.' },
      { id: 'chaat', name: 'Samosas & Chaat', emoji: '🥟', cuisine: 'indian', search: 'chaat', wiki: 'Chaat', osm: 'chaat', tags: 'fried handheld veg cheap quick spicy~', desc: 'Crunchy, tangy, spicy street snacks — samosas, pani puri, and more.' },

      // Asian fusion
      { id: 'poke', name: 'Poke Bowl', emoji: '🐟', cuisine: 'hawaiian asian-fusion', search: 'poke', pop: 1.2, wiki: 'Poke (dish)', osm: 'poke', tags: 'raw seafood rice healthy cold quick', desc: 'Marinated raw tuna or salmon over rice with all the toppings you want.' },
      { id: 'kbbq-tacos', name: 'Korean BBQ Tacos', emoji: '🌮', cuisine: 'asian-fusion korean~', search: 'korean tacos', wiki: 'Korean taco', tags: 'handheld grilled meat quick spicy~', desc: 'Bulgogi or spicy pork in a tortilla with kimchi slaw — Seoul meets street taco.' },
      { id: 'sushi-burrito', name: 'Sushi Burrito', emoji: '🌯', cuisine: 'asian-fusion japanese~', wiki: 'Sushi burrito', osm: 'sushi|poke', tags: 'raw seafood handheld rice quick healthy~', desc: 'A sushi roll the size of a burrito — eat it on the go.' },
      { id: 'teriyaki', name: 'Teriyaki Bowl', emoji: '🍱', cuisine: 'asian-fusion japanese~', search: 'teriyaki', wiki: 'Teriyaki', osm: 'teriyaki', tags: 'rice meat grilled quick cheap healthy~', desc: 'Glossy grilled teriyaki chicken over rice with steamed veggies.' },
      { id: 'kimchi-fries', name: 'Kimchi Fries', emoji: '🍟', cuisine: 'asian-fusion korean~', wiki: 'Cheese fries', tags: 'fried cheesy spicy~ meat~ group~', desc: 'Fries loaded with bulgogi, caramelized kimchi, cheese, and spicy mayo.' },

      // Mexican
      { id: 'street-tacos', name: 'Street Tacos', emoji: '🌮', cuisine: 'mexican', search: 'tacos', pop: 1.5, wiki: 'Taco', osm: 'taco|tacos', tags: 'handheld meat cheap quick grilled~ spicy~', desc: 'Al pastor, carne asada, carnitas — small tortillas, onion, cilantro, salsa.' },
      { id: 'burrito', name: 'Burrito', emoji: '🌯', cuisine: 'mexican', pop: 1.3, wiki: 'Burrito', osm: 'burrito', tags: 'handheld rice hearty cheap quick cheesy~ meat~ veg~', desc: 'A big foil-wrapped burrito stuffed with rice, beans, meat, and salsa.' },
      { id: 'birria', name: 'Birria Tacos', emoji: '🌮', cuisine: 'mexican', wiki: 'Birria', osm: 'birria|taco', tags: 'handheld cheesy meat hearty soup~ fried~ spicy~', desc: 'Cheesy, griddled beef tacos dunked in rich consomé.' },
      { id: 'enchiladas', name: 'Enchiladas', emoji: '🫔', cuisine: 'mexican', search: 'mexican restaurant', wiki: 'Enchilada', tags: 'cheesy hearty spicy~ veg~ meat~', desc: 'Rolled tortillas smothered in chile sauce and melted cheese.' },
      { id: 'quesadilla', name: 'Quesadilla', emoji: '🧀', cuisine: 'mexican', wiki: 'Quesadilla', tags: 'cheesy handheld quick cheap veg~ meat~', desc: 'A griddled tortilla with gooey melted cheese and your pick of fillings.' },
      { id: 'pozole', name: 'Pozole', emoji: '🍲', cuisine: 'mexican', wiki: 'Pozole', tags: 'soup hearty meat spicy~', desc: 'Hearty hominy stew with pork and red chile, topped with radish and lime.' },
      { id: 'torta', name: 'Torta', emoji: '🥪', cuisine: 'mexican', wiki: 'Torta', tags: 'bread handheld meat hearty cheap spicy~', desc: 'Mexican sandwich on a toasted bolillo with meat, beans, avocado, and jalapeños.' },
      { id: 'nachos', name: 'Loaded Nachos', emoji: '🧀', cuisine: 'mexican', search: 'nachos', wiki: 'Nachos', tags: 'cheesy group fried hearty quick~ spicy~ veg~ meat~', desc: 'Chips piled high with cheese, beans, jalapeños, and every topping.' },
      { id: 'mariscos', name: 'Mariscos (Aguachile)', emoji: '🦐', cuisine: 'mexican', search: 'mariscos', wiki: 'Aguachile', osm: 'mariscos', tags: 'seafood raw cold spicy healthy', desc: 'Lime-cured shrimp with chile, cucumber, and red onion — bright and spicy.' },

      // Peruvian
      { id: 'pollo-brasa', name: 'Pollo a la Brasa', emoji: '🍗', cuisine: 'peruvian', search: 'peruvian chicken', wiki: 'Pollo a la brasa', tags: 'grilled meat hearty cheap~ group~ spicy~ fried~', desc: 'Peruvian rotisserie chicken with fries and creamy green ají sauce.' },
      { id: 'ceviche', name: 'Ceviche', emoji: '🐟', cuisine: 'peruvian', wiki: 'Ceviche', tags: 'raw seafood cold healthy spicy~', desc: 'Raw fish cured in tangy lime “leche de tigre” with chile and sweet potato.' },
      { id: 'lomo-saltado', name: 'Lomo Saltado', emoji: '🥩', cuisine: 'peruvian', wiki: 'Lomo saltado', tags: 'wok meat rice hearty fried~', desc: 'Wok-seared beef with tomatoes, onions, and fries over rice — Peruvian-Chinese.' },

      // Caribbean
      { id: 'jerk-chicken', name: 'Jerk Chicken', emoji: '🔥', cuisine: 'caribbean', wiki: 'Jerk (cooking)', osm: 'jamaican', tags: 'grilled spicy meat rice hearty', desc: 'Smoky, fiery allspice-and-scotch-bonnet chicken with rice and peas.' },
      { id: 'cuban-sandwich', name: 'Cuban Sandwich', emoji: '🥪', cuisine: 'caribbean', wiki: 'Cuban sandwich', osm: 'cuban', tags: 'bread handheld meat cheesy hearty', desc: 'Pressed bread with roast pork, ham, Swiss, pickles, and mustard.' },
      { id: 'oxtail', name: 'Oxtail Stew', emoji: '🍲', cuisine: 'caribbean', search: 'jamaican oxtail', wiki: 'Oxtail', tags: 'meat rice hearty soup~', desc: 'Fall-off-the-bone oxtail braised in rich gravy, with rice and peas.' },

      // Salvadoran
      { id: 'pupusas', name: 'Pupusas', emoji: '🫓', cuisine: 'salvadoran', wiki: 'Pupusa', tags: 'cheesy cheap handheld~ veg~ hearty~ quick~', desc: 'Thick griddled corn cakes stuffed with cheese, beans, or pork, with curtido slaw.' },

      // Italian
      { id: 'pizza', name: 'Pizza', emoji: '🍕', cuisine: 'italian classic-american', pop: 1.5, wiki: 'Pizza', osm: 'pizza', tags: 'cheesy handheld group bread~ quick~ cheap~ veg~ meat~', desc: 'Thin, crispy, or deep-dish — a gooey cheesy slice, or the whole pie.' },
      { id: 'red-pasta', name: 'Spaghetti & Lasagna', emoji: '🍝', cuisine: 'italian', search: 'italian restaurant', wiki: 'Lasagna', osm: 'pasta', tags: 'noodles hearty cheesy~ meat~ veg~', desc: 'Red-sauce classics — spaghetti and meatballs, baked lasagna, garlic bread.' },
      { id: 'creamy-pasta', name: 'Creamy Pasta', emoji: '🍝', cuisine: 'italian', search: 'pasta', wiki: 'Carbonara', osm: 'pasta', tags: 'noodles cheesy hearty meat~ veg~', desc: 'Carbonara, alfredo, or cacio e pepe — rich, silky, and indulgent.' },
      { id: 'seafood-pasta', name: 'Seafood Pasta', emoji: '🦐', cuisine: 'italian', wiki: 'Spaghetti alle vongole', osm: 'pasta', tags: 'noodles seafood healthy~', desc: 'Linguine with clams, shrimp scampi, or frutti di mare.' },
      { id: 'italian-sub', name: 'Italian Deli Sandwich', emoji: '🥪', cuisine: 'italian classic-american~', search: 'italian deli', wiki: 'Submarine sandwich', osm: 'sandwich|deli', tags: 'bread handheld meat quick cold cheesy~', desc: 'Salami, mortadella, provolone, and peppers on a crusty roll.' },
      { id: 'risotto', name: 'Risotto', emoji: '🍚', cuisine: 'italian', wiki: 'Risotto', tags: 'rice cheesy hearty veg~ seafood~', desc: 'Creamy, slow-stirred rice with parmesan, mushrooms, or seafood.' },
      { id: 'chicken-parm', name: 'Chicken Parm', emoji: '🍗', cuisine: 'italian classic-american~', search: 'chicken parmesan', wiki: 'Chicken parmigiana', tags: 'fried cheesy meat hearty bread~', desc: 'Breaded chicken cutlet under marinara and bubbling mozzarella.' },

      // French
      { id: 'croque', name: 'Croque Monsieur', emoji: '🥪', cuisine: 'french', search: 'french bistro', wiki: 'Croque monsieur', tags: 'bread cheesy meat hearty handheld~', desc: 'A toasted ham-and-gruyère sandwich blanketed in béchamel.' },
      { id: 'steak-frites', name: 'Steak Frites', emoji: '🥩', cuisine: 'french', wiki: 'Steak frites', tags: 'meat grilled hearty fried~', desc: 'Seared steak with a pile of crispy fries and herb butter.' },
      { id: 'onion-soup', name: 'French Onion Soup', emoji: '🧅', cuisine: 'french', wiki: 'French onion soup', tags: 'soup cheesy hearty bread~ veg~', desc: 'Caramelized onion broth under a lid of toasted bread and melted gruyère.' },
      { id: 'crepes', name: 'Savory Crêpes', emoji: '🥞', cuisine: 'french', search: 'crepes', wiki: 'Galette', osm: 'crepe', tags: 'cheesy handheld~ quick~ veg~ meat~ healthy~', desc: 'Thin buckwheat galettes folded around ham, egg, and cheese.' },

      // Spanish
      { id: 'paella', name: 'Paella', emoji: '🥘', cuisine: 'spanish', wiki: 'Paella', tags: 'rice seafood group hearty meat~', desc: 'A saffron rice pan loaded with seafood, chicken, and chorizo.' },
      { id: 'tapas', name: 'Tapas', emoji: '🍢', cuisine: 'spanish', wiki: 'Tapas', osm: 'tapas', tags: 'group fried~ seafood~ meat~ veg~ spicy~', desc: 'Small plates to share — patatas bravas, croquetas, gambas al ajillo.' },

      // British
      { id: 'fish-chips', name: 'Fish & Chips', emoji: '🐟', cuisine: 'british', search: 'fish and chips', wiki: 'Fish and chips', osm: 'fish_and_chips', tags: 'fried seafood hearty', desc: 'Beer-battered cod with thick-cut chips, tartar sauce, and malt vinegar.' },

      // Greek
      { id: 'gyro', name: 'Gyro', emoji: '🥙', cuisine: 'greek', wiki: 'Gyros', osm: 'gyro|greek', tags: 'bread handheld meat quick cheap grilled~', desc: 'Shaved, spit-roasted meat in warm pita with tzatziki, tomato, and onion.' },
      { id: 'souvlaki', name: 'Souvlaki Plate', emoji: '🍢', cuisine: 'greek', search: 'souvlaki', wiki: 'Souvlaki', tags: 'grilled meat healthy~ rice~', desc: 'Grilled skewers with lemon potatoes, salad, and tzatziki.' },
      { id: 'greek-salad', name: 'Greek Salad', emoji: '🥗', cuisine: 'greek', search: 'greek restaurant', wiki: 'Greek salad', tags: 'healthy cold veg cheesy~ quick~', desc: 'Tomato, cucumber, olives, red onion, and a big slab of feta.' },

      // Middle Eastern
      { id: 'shawarma', name: 'Shawarma', emoji: '🌯', cuisine: 'middle-eastern', wiki: 'Shawarma', osm: 'shawarma|kebab', tags: 'bread handheld meat quick cheap grilled~ spicy~', desc: 'Spiced, spit-roasted chicken or beef wrapped with garlic sauce and pickles.' },
      { id: 'falafel', name: 'Falafel', emoji: '🧆', cuisine: 'middle-eastern', wiki: 'Falafel', osm: 'falafel', tags: 'fried veg handheld bread cheap quick healthy~', desc: 'Crispy herbed chickpea fritters in pita with tahini and pickled veggies.' },
      { id: 'kebab-plate', name: 'Kebab Plate', emoji: '🍢', cuisine: 'middle-eastern', search: 'kebab', wiki: 'Kofta', osm: 'kebab', tags: 'grilled meat rice hearty~ healthy~', desc: 'Charred kofta and chicken kebabs over saffron rice with grilled tomato.' },
      { id: 'mezze', name: 'Mezze Platter', emoji: '🫒', cuisine: 'middle-eastern', search: 'mediterranean restaurant', wiki: 'Meze', osm: 'lebanese|mediterranean', tags: 'veg healthy group cold bread~', desc: 'Hummus, baba ganoush, tabbouleh, and warm pita for dipping.' },

      // Classic American
      { id: 'burger', name: 'Burger', emoji: '🍔', cuisine: 'classic-american', pop: 1.5, wiki: 'Hamburger', osm: 'burger', tags: 'bread handheld meat hearty cheesy~ quick~ fried~', desc: 'A juicy smash or pub burger with fries on the side.' },
      { id: 'chicken-sandwich', name: 'Fried Chicken Sandwich', emoji: '🍗', cuisine: 'classic-american southern~', wiki: 'Chicken sandwich', osm: 'chicken', tags: 'fried bread handheld meat quick spicy~ hearty~', desc: 'Crunchy buttermilk-fried chicken on a brioche bun with pickles.' },
      { id: 'mac-cheese', name: 'Mac & Cheese', emoji: '🧀', cuisine: 'classic-american southern~', search: 'mac and cheese', wiki: 'Macaroni and cheese', tags: 'cheesy hearty noodles~ veg~', desc: 'Baked, bubbly, extra-cheesy comfort in a bowl.' },
      { id: 'deli-sub', name: 'Deli Sub', emoji: '🥖', cuisine: 'classic-american', search: 'sandwich shop', wiki: 'Club sandwich', osm: 'sandwich|deli', tags: 'bread handheld quick cheap cold meat~ veg~ healthy~', desc: 'A stacked turkey, roast beef, or veggie sub, made your way.' },
      { id: 'salad-bowl', name: 'Salad or Grain Bowl', emoji: '🥗', cuisine: 'classic-american', search: 'salad', wiki: 'Salad', osm: 'salad', tags: 'healthy cold quick veg~ meat~', desc: 'A big, fresh build-your-own bowl with greens, grains, and protein.' },
      { id: 'wings', name: 'Buffalo Wings', emoji: '🍗', cuisine: 'classic-american', search: 'wings', wiki: 'Buffalo wing', osm: 'wings|chicken', tags: 'fried spicy meat group handheld', desc: 'Crispy wings tossed in hot sauce, with blue cheese and celery.' },
      { id: 'hot-dog', name: 'Hot Dogs', emoji: '🌭', cuisine: 'classic-american', wiki: 'Hot dog', osm: 'hot_dog', tags: 'bread handheld meat quick cheap', desc: 'Snappy franks loaded with mustard, relish, chili, or slaw.' },
      { id: 'cheesesteak', name: 'Philly Cheesesteak', emoji: '🥩', cuisine: 'classic-american', search: 'cheesesteak', wiki: 'Cheesesteak', osm: 'cheesesteak|sandwich', tags: 'bread handheld meat cheesy hearty grilled~', desc: 'Thin-sliced griddled steak, onions, and melty cheese on a hoagie roll.' },
      { id: 'lobster-roll', name: 'Lobster Roll', emoji: '🦞', cuisine: 'classic-american', wiki: 'Lobster roll', osm: 'seafood', tags: 'seafood bread handheld cold~', desc: 'Sweet lobster in butter or mayo, piled into a toasted split-top bun.' },
      { id: 'brunch', name: 'Diner Brunch', emoji: '🥞', cuisine: 'classic-american', search: 'brunch', wiki: 'Full breakfast', osm: 'breakfast|brunch|diner', tags: 'hearty cheap~ meat~ veg~ fried~ group~', desc: 'Eggs, bacon, hash browns, and a stack of pancakes — any time of day.' },

      // Southern & BBQ
      { id: 'bbq', name: 'Smoked BBQ', emoji: '🍖', cuisine: 'southern', search: 'bbq', pop: 1.2, wiki: 'Brisket', osm: 'bbq|barbecue', tags: 'grilled meat hearty group~ spicy~', desc: 'Low-and-slow brisket, ribs, and pulled pork with all the sides.' },
      { id: 'fried-chicken', name: 'Fried Chicken & Biscuits', emoji: '🍗', cuisine: 'southern', search: 'fried chicken', wiki: 'Fried chicken', osm: 'chicken', tags: 'fried meat hearty bread~ handheld~', desc: 'Crispy Southern fried chicken with flaky buttermilk biscuits.' },
      { id: 'nashville-hot', name: 'Nashville Hot Chicken', emoji: '🔥', cuisine: 'southern', wiki: 'Hot chicken', osm: 'chicken', tags: 'fried spicy meat hearty bread~ handheld~', desc: 'Cayenne-drenched fried chicken on white bread with pickles. Very spicy.' },
      { id: 'gumbo', name: 'Gumbo & Jambalaya', emoji: '🍤', cuisine: 'southern', search: 'cajun restaurant', wiki: 'Gumbo', osm: 'cajun|creole', tags: 'rice soup spicy meat hearty seafood~', desc: 'Cajun comfort — smoky, spicy stews with sausage, shrimp, and rice.' },
      { id: 'shrimp-grits', name: 'Shrimp & Grits', emoji: '🦐', cuisine: 'southern', search: 'shrimp and grits', wiki: 'Shrimp and grits', osm: 'southern|cajun', tags: 'seafood cheesy hearty spicy~', desc: 'Creamy, cheesy grits topped with garlicky Cajun shrimp.' },
      { id: 'seafood-boil', name: 'Cajun Seafood Boil', emoji: '🦀', cuisine: 'southern asian-fusion~', search: 'seafood boil', wiki: 'Seafood boil', osm: 'seafood|cajun', tags: 'seafood spicy group hearty handheld~', desc: 'Crawfish, shrimp, corn, and potatoes in garlicky Cajun butter. Get messy.' },

      // Hawaiian
      { id: 'plate-lunch', name: 'Hawaiian Plate Lunch', emoji: '🌺', cuisine: 'hawaiian', search: 'hawaiian bbq', wiki: 'Plate lunch', tags: 'rice meat hearty cheap grilled~', desc: 'Kalua pork or loco moco with two scoops rice and mac salad.' },
      { id: 'spam-musubi', name: 'Spam Musubi', emoji: '🍙', cuisine: 'hawaiian', wiki: 'Spam musubi', tags: 'rice handheld quick cheap meat cold~', desc: 'Grilled Spam on a block of rice, wrapped in nori. The perfect quick bite.' },

      // Ethiopian
      { id: 'ethiopian', name: 'Ethiopian Combo Platter', emoji: '🍲', cuisine: 'ethiopian', search: 'ethiopian restaurant', wiki: 'Injera', tags: 'group handheld veg~ spicy~ curry~ healthy~ hearty~ bread~', desc: 'Spongy injera topped with spiced stews and lentils — eat with your hands.' },
    ],
  };

  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.CUPID_DATA = data;
})(typeof window !== 'undefined' ? window : globalThis);
