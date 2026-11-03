import type { ExternalPathString } from 'expo-router';

const MIT = (copyright: string) => `${copyright}

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

const UNICODE_V3 = (copyright: string) => `${copyright}

NOTICE TO USER: Carefully read the following legal agreement. BY DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.

Permission is hereby granted, free of charge, to any person obtaining a copy of data files and any associated documentation (the "Data Files") or software and any associated documentation (the "Software") to deal in the Data Files or Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, and/or sell copies of the Data Files or Software, and to permit persons to whom the Data Files or Software are furnished to do so, provided that either (a) this copyright and permission notice appear with all copies of the Data Files or Software, or (b) this copyright and permission notice appear in associated Documentation.

THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF THIRD PARTY RIGHTS.

IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES, OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA FILES OR SOFTWARE.

Except as contained in this notice, the name of a copyright holder shall not be used in advertising or otherwise to promote the sale, use or other dealings in these Data Files or Software without prior written authorization of the copyright holder.`;

export interface LegalNotice {
  name: string;
  url: ExternalPathString;
  attribution: string;
  license: string;
  licenseUrl: ExternalPathString;
  /** Full text where the license requires the notice itself be reproduced. */
  licenseText?: string;
}

// Bundled third-party assets whose licenses require attribution. OFL fonts
// carry their notice in the file and are not listed.
export const LEGAL_NOTICES: readonly LegalNotice[] = [
  {
    name: 'Twemoji',
    url: 'https://github.com/jdecked/twemoji',
    attribution:
      'Emoji graphics copyright Twitter, Inc and other contributors. Harbor adds some of its own.',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
  {
    name: 'Ionicons',
    url: 'https://ionic.io/ionicons',
    attribution: 'Copyright (c) 2015-present Ionic (http://ionic.io/)',
    license: 'MIT License',
    licenseUrl: 'https://github.com/ionic-team/ionicons/blob/main/LICENSE',
    licenseText: MIT('Copyright (c) 2015-present Ionic (http://ionic.io/)'),
  },
  {
    name: 'Material Icons',
    url: 'https://fonts.google.com/icons',
    attribution: 'Copyright Google LLC',
    license: 'Apache License 2.0',
    licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
  },
  {
    name: 'Material Design Icons',
    url: 'https://pictogrammers.com/library/mdi/',
    attribution: 'Copyright Pictogrammers',
    license: 'Apache License 2.0',
    licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
  },
  {
    name: 'Unicode emoji data',
    url: 'https://www.unicode.org/reports/tr51/',
    attribution: 'Copyright © 1991-2025 Unicode, Inc.',
    license: 'Unicode License v3',
    licenseUrl: 'https://www.unicode.org/license.txt',
    licenseText: UNICODE_V3('Copyright © 1991-2025 Unicode, Inc.'),
  },
  {
    name: 'Emojibase',
    url: 'https://emojibase.dev',
    attribution: 'Copyright (c) 2017-2019 Miles Johnson',
    license: 'MIT License',
    licenseUrl: 'https://github.com/milesj/emojibase/blob/master/LICENSE',
    licenseText: MIT('Copyright (c) 2017-2019 Miles Johnson'),
  },
];
