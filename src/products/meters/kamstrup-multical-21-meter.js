import WirelessMBusMeter from "./../../includes/meter/wmbus-meter"
import crypto from 'crypto'

// Static instance
var instance = null;

/**
* Kamstrup Multical 21 wireless M-Bus meter.
*
* Notes:
* Multical 21 uses wireless M-Bus, 868 MHz, Mode C1. Data packets are sent every
* 16 seconds, and every eight packet is "full" string. Other packets are
* "compact" strings.
*
* Data packets are sent at intervals of approx. 16 seconds. Every eights packet is a ”full string”, whereas the 7 intervening packets are ”compact strings”.
*
* All data packets are encrypted with 128 bit AES counter mode encryption
*
* This implementation is used with C1 mode meters with encrypted ELL.
*/
class KamstrupMultical21Meter extends WirelessMBusMeter {

  /**
  * Process telegram by fetching meter values from raw data packet.
  *
  * @param telegram
  *   Telegram to be processed.
  * @param options
  *   aes - AES key if needed
  *
  * @return boolean succeed
  */
  processTelegramData(telegram, options = {}) {

    if (!super.processTelegramData(telegram, options)) {
      return false;
    }

    telegram.setValue('BLOCKX_FN', Buffer.alloc(2,'0000', "hex"));
    telegram.setValue('BLOCKX_BC', Buffer.alloc(1,'00', "hex"));

    // If AES key is not provided directly, try to load it from meter data
    if (!options.hasOwnProperty('aes')) {
      let meterData = this.getMeterData(telegram);

      if (meterData && meterData.hasOwnProperty('aes'))
        options['aes'] = meterData['aes'];
    }

    if (options.hasOwnProperty('aes')) {
      telegram.setValue('BLOCK2_DECRYPTED_ELL_DATA',
        this.decryptTelegram(telegram, options));

      // Fetch meter information
      telegram.setValues(this.processTelegramValues(telegram, options));
      //console.log('---');
      //console.log(telegram.getPacket().getBuffer().toString('hex'));
      //console.log(this.getDecryptedELLData(telegram).toString('hex'));
      //console.log('-**-');
    }
    return true;
  }

  /**
  * Method returns meter information.
  *
  * @param telegram
  * @return meter information
  */
  describeMeter(telegram) {
    return this.describeMeterData(this.getMeterData(telegram));
  }

  /**
  * Metod returns label for meter data
  *
  * @param meterData
  * @return label
  */
  describeMeterData(meterData = false) {
    if (!meterData)
      return 'unknown';

    const types = {
      '06': 'VolumeHeat',
      '16': 'VolumeCold'
    }

    let meterType = types.hasOwnProperty(meterData['deviceType']) ?
      types[meterData['deviceType']] : "unknown";
    return `${meterData['label']} (${meterType})`;
  }

  /**
  * Describe device type.
  *
  * @param telegram
  * @return label
  */
  getDeviceType(telegram) {
    let meterData = this.getMeterData(telegram);
    return meterData ? meterData['deviceType'] : 'unknown';
  }

  /**
  * Returns extended data link layer map.
  *
  * Block 2 (Extended Data Link Layer)
  * CI (1 byte) CC(1 byte)   ACC(1 byte)  SN(4 bytes)  CRC(2  bytes)
  *
  * CI-FIELD (1 byte)
  *   Application header, indicates application data payload type.
  *
  * DATA-field
  *
  * CC-FIELD (1 byte)
  * CC is a communication control field and is coded using the following bitmask
  * Bit 7  |  Bit 6  |  Bit 5  |  Bit 4  |  Bit 3  |  Bit 2  |  Bit 1
  * B-field| D-field | S-field | H-field | P-field | A-field | Reserved
  * 
  * B-field,  when  set  to  1,  indicates  that the  sending  device  implements  bidirectional communication
  * D-field controls  the  response  delay  of  the  responding  device,  indicating  whether  a fast (D-field set) or slow (D-field cleared) response delay should be used
  * S-field, when set to 1, indicates a synchronized frame
  * H-field, when set to 1, indicates that the frame has been relayed by a repeater
  * P-field, when set to 1, indicates a high priority frame
  * A-field (Accessibility) is used in conjunction with the B-field to specify when a meter enables radio reception after a frame transmission
  * R-field (Repeated  Access) is  used  by  single  hop  repeaters  according  to  the  rules  in the EN 13757-5 specification
  *
  * ACC (1 byte)
  *   Access counter number, runs from 00 to ff.
  *
  * SN-FIELD (4 bytes)
  *   Encryption mode, time field, session counter
  *
  * CRC-FIELD (2 bytes)
  *   Cyclic Redundancy Check for data.
  *
  * @return mapping
  *   Object with mapping details
  */
  getELLMap() {
    return {
      'BLOCK2_CI': {
        start: 10,
        length: 1
        },
      'BLOCK2_CC': {
        start: 11,
        length: 1
        },
      'BLOCK2_ACC': {
        start: 12,
        length: 1
        },
      'BLOCK2_SN': {
        start: 13,
        length: 4
        },
      'BLOCK2_CRC': {
        start: 17,
        length: 2
        }
      };
  }

  /**
  * Extract meter Application Header from details.
  *
  * @param telegram
  * @return ci field
  */
  getCIField(telegram) {
    let values = telegram.getValues();
    return values.has('BLOCK2_CI') ?
      values.get('BLOCK2_CI') : null;
  }

  /**
  * Extract meter CC details.
  *
  * @param telegram
  * @return ci field
  */
  getCCField(telegram) {
    let values = telegram.getValues();
    return values.has('BLOCK2_CC') ?
      values.get('BLOCK2_CC') : null;
  }

  /**
  * Extract meter Access Counter Number.
  *
  * @param telegram
  * @return ACN
  */
  getACCField(telegram) {
    let values = telegram.getValues();
    return values.has('BLOCK2_ACC') ?
      values.get('BLOCK2_ACC') : null;
  }

  /**
  * Extract meter SN field.
  *
  * @param telegram
  * @return SN field
  */
  getSNField(telegram) {
    let values = telegram.getValues();
    return values.has('BLOCK2_SN') ?
      values.get('BLOCK2_SN') : null;
  }

  /**
  * Extract meter ELL CRC field.
  *
  * @param telegram
  * @return telegram
  */
  getELLCRC(telegram) {
    let values = telegram.getValues();
    return values.has('BLOCK2_CRC') ?
      values.get('BLOCK2_CRC') : null;
  }

  /**
  * Extract meter
  *
  * @param telegram
  * @return telegram
  */
  getDecryptedELLData(telegram) {
    let values = telegram.getValues();
    return values.has('BLOCK2_DECRYPTED_ELL_DATA') ?
      values.get('BLOCK2_DECRYPTED_ELL_DATA') : null;
  }

  /**
  * Returns initialization vector for decrypt the ELL data.
  * Kamstrup uses AES with CTR (no padding) encryption. To decrypt data,
  * we need to fetch iv from M, A, CC and SN field with FN and BC (Validate these).
  *
  * @param telegram
  * @return iv buffer
  */
  getIV(telegram) {
    let buffers = [];
    let values = telegram.getValues();
    let blockMap = [
      'BLOCK1_A',
      'BLOCK2_CC',
      'BLOCK2_SN',
      'BLOCKX_FN',
      'BLOCKX_BC'].forEach(fieldName => {
        buffers.push(values.get(fieldName));
      });
    return Buffer.concat(buffers, 16);
  }

  /**
  * Decrypt telegram
  *
  * @param telegram
  * @param options with following key values:
  *   key - AES key for this telegram meter
  */
  decryptTelegram(telegram, options = {}) {
    if (!options.hasOwnProperty('aes'))
      return false;

    let AESKey = Buffer.alloc(options['aes'].length/2, options['aes'], 'hex');

    let encryptedData = this.getEncryptedELLData(telegram)
      .get('BLOCK2_ENCRYPTED_ELL_DATA');

    let initializationVector = this.getIV(telegram);
    return this.decryptBuffer(encryptedData, AESKey, initializationVector);
  }

  /**
  * Decrypt given buffer using AES.
  * TODO: Move this to own module?
  *
  * @param buffer
  *   Encrypted buffer
  * @param key
  *   AES key
  * @param iv
  *   Initialize vector
  * @return decrypted data
  */
  decryptBuffer(buffer, key, iv, algorithm = 'aes-128-ctr') {
    let decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAutoPadding(false);
    return Buffer.concat([decipher.update(buffer), decipher.final()]);
  }

  /**
  * Returns encrypted ELL data.
  *
  * @param telegram
  * @return data buffer
  */
  getEncryptedELLData(telegram) {
    let packet = telegram.getPacket();
    let startIndex = 17;
    let length = packet.getBuffer().length - startIndex;

    return this.fetchData(packet, {
      BLOCK2_ENCRYPTED_ELL_DATA: {
        start: startIndex,
        length: length
      }
    });
  }

  /**
  * Process telegram values
  *
  * @param telegram
  */
  processTelegramValues(telegram) {
    // Retrieve if this is short frame or long frame
    let data = this.getDecryptedELLData(telegram);

    // Get frame type
    let fV = this.fetchData(data, {
      'BLOCK3_FRAME_TYPE': {
        start: 2,
        length: 1
        }
    });

    let frameTypeCode = fV.get('BLOCK3_FRAME_TYPE').toString('hex');
    /*
    console.log('---');
    console.log(frameTypeCode);
    console.log(telegram.getPacket().getBuffer().toString('hex'));
    console.log(this.getDecryptedELLData(telegram).toString('hex'));
    console.log('-**-');
    */
    switch (frameTypeCode) {
      case '79':
        // This telegram is short frame
        return this.fetchData(data, {
          'BLOCK3_PLCRC': {
            start: 0,
            length: 2
            },
          'BLOCK3_FRAME_TYPE': {
            start: 2,
            length: 1
            },
          'BLOCK3_EXTRA_CRC': {
            start: 3,
            length: 4
            },
          'DATA_RECORD_1_VALUE': {
            start: 7,
            length: 2
            },
          'DATA_RECORD_2_VALUE': {
            start: 9,
            length: 4
            },
          'DATA_RECORD_3_VALUE': {
            start: 13,
            length: 4
            }
          });
        break;

      case '78':
        // TODO: Add symbol table to support short frames...

        // This telegram is full frame
        return this.fetchData(data, {
          'BLOCK3_PLCRC': {
            start: 0,
            length: 2
            },
          'BLOCK3_FRAME_TYPE': {
            start: 2,
            length: 1
            },
          'DATA_RECORD_1_DIF': {
            start: 3,
            length: 1
            },
          'DATA_RECORD_1_VIF': {
            start: 4,
            length: 1
            },
          'DATA_RECORD_1_VIFE': {
            start: 5,
            length: 1
            },
          'DATA_RECORD_1_VALUE': {
            start: 6,
            length: 2
            },
          'DATA_RECORD_2_DIF': {
            start: 8,
            length: 1
            },
          'DATA_RECORD_2_VIF': {
            start: 9,
            length: 1
            },
          'DATA_RECORD_2_VALUE': {
            start: 10,
            length: 4
            },
          'DATA_RECORD_3_DIF': {
            start: 14,
            length: 1
            },
          'DATA_RECORD_3_VIF': {
            start: 15,
            length: 1
            },
          'DATA_RECORD_3_VALUE': {
            start: 16,
            length: 4
            },
          });
        break;
    }
  }

  /**
  * Returns meter value.
  *
  * @param telegram
  * @return meter value
  *   Reverse buffer converted to number value.
  */
  getMeterValue(telegram) {
    let values = telegram.getValues();
    return values.has('DATA_RECORD_2_VALUE') ?
      this.parseMeterValue(values.get('DATA_RECORD_2_VALUE').readUInt32LE()) : null;
  }

  /**
  * Returns meter target value
  *
  * @param telegram
  */
  getMeterTargetValue(telegram) {
    let values = telegram.getValues();
    return values.has('DATA_RECORD_3_VALUE') ?
      this.parseMeterValue(values.get('DATA_RECORD_3_VALUE').readUInt32LE()) : null;
  }

    getInfoCodeDry(telegram) {
        let values = telegram.getValues();
        if (values.has('DATA_RECORD_1_VALUE')) {
            let infoCodes = values.get('DATA_RECORD_1_VALUE').readUInt16LE();
            return (infoCodes & 0x01) != 0;
        }
        else
            return null;
      
    }

    getInfoCodeReverse(telegram) {
        let values = telegram.getValues();
        if (values.has('DATA_RECORD_1_VALUE')) {
            let infoCodes = values.get('DATA_RECORD_1_VALUE').readUInt16LE();
            return (infoCodes & 0x02) != 0;
        }
        else
            return null;

    }

    getInfoCodeLeak(telegram) {
        let values = telegram.getValues();
        if (values.has('DATA_RECORD_1_VALUE')) {
            let infoCodes = values.get('DATA_RECORD_1_VALUE').readUInt16LE();
            return (infoCodes & 0x04) != 0;
        }
        else
            return null;

    }

    getInfoCodeBurst(telegram) {
        let values = telegram.getValues();
        if (values.has('DATA_RECORD_1_VALUE')) {
            let infoCodes = values.get('DATA_RECORD_1_VALUE').readUInt16LE();
            return (infoCodes & 0x08) != 0;
        }
        else
            return null;

    }

    getInfoCodeDryDuration(telegram) {
        let values = telegram.getValues();
        if (values.has('DATA_RECORD_1_VALUE')) {
            let infoCodes = values.get('DATA_RECORD_1_VALUE').readUInt16LE();
            let infoDuration = (infoCodes & 0x70) >> 4;
            return this.transformDuration(infoDuration);
           
        }
        else
            return null;

    }

    getInfoCodeReverseDuration(telegram) {
        let values = telegram.getValues();
        if (values.has('DATA_RECORD_1_VALUE')) {
            let infoCodes = values.get('DATA_RECORD_1_VALUE').readUInt16LE();
            let infoDuration = (infoCodes & 0x0380) >> 7;
            return this.transformDuration(infoDuration);
        }
        else
            return null;

    }

    getInfoCodeLeakDuration(telegram) {
        let values = telegram.getValues();
        if (values.has('DATA_RECORD_1_VALUE')) {
            let infoCodes = values.get('DATA_RECORD_1_VALUE').readUInt16LE();
            let infoDuration = (infoCodes & 0x1C00) >> 10;
            return this.transformDuration(infoDuration);
        }
        else
            return null;

    }

    getInfoCodeBurstDuration(telegram) {
        let values = telegram.getValues();
        if (values.has('DATA_RECORD_1_VALUE')) {
            let infoCodes = values.get('DATA_RECORD_1_VALUE').readUInt16LE();
            let infoDuration = (infoCodes & 0x7000) >> 13;
            return this.transformDuration(infoDuration);
        }
        else
            return null;

    }

    transformDuration(durationCode) {
        switch (durationCode) {
            case 0:
                return '0 hours';
            case 1:
                return '1-8 hours';
            case 2:
                return '9-24 hours';
            case 3:
                return '25-72 hours';
            case 4:
                return '73-168 hours';
            case 5:
                return '169-336 hours';
            case 6:
                return '337-504 hours';
            case 7:
                return '≥505 hours';
            default:
                return 'Invalid duration code';
        }
    }


  /**
  * Parse float value.
  *
  * @param value
  * @return value
  */
  parseMeterValue(value) {
    return parseFloat(value) / 1000;
  }

  /**
  * Returns singleton instance of meter.
  *
  * @return instance
  */
  static getInstance() {
    if (!instance) instance = new KamstrupMultical21Meter();
    return instance;
  }
}

export default KamstrupMultical21Meter;