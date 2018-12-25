### obj pack for dcf

Basically it's same as msgpack v5, with some difference in spec:

1. byte 0xc1 is defined as "undefined"
2. undefine value in object will not be ignored.
3. NaN will not cause error.
