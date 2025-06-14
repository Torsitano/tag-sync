import { CreateTagsCommand, EC2Client, Instance, Tag, Volume } from '@aws-sdk/client-ec2'
import { DRY_RUN_VOLUMES, OVERWRITE_TAGS_ON_VOLUME_FROM_INSTANCE } from './main'


export async function applyInstanceTagsToVolumes( ec2Client: EC2Client, instance: Instance, volumes: Map<string, Volume> ) {
    if ( !instance.Tags ) {
        console.log( `Instance '${instance.InstanceId}' has no tags, skipping` )
        return
    }

    for ( const mapping of instance.BlockDeviceMappings || [] ) {
        // console.log( `Checking mapping: ${JSON.stringify( mapping )}` )

        const volumeId = mapping.Ebs!.VolumeId!
        const volume = volumes.get( volumeId )

        // It should be impossible to run into this, but just in case
        if ( !volume ) {
            console.warn( `Volume '${volumeId}' not found for instance '${instance.InstanceId}'` )
            continue
        }

        const tagsToApply: Tag[] = []

        for ( const tag of instance.Tags ) {

            // Skip the "Name" tag/variations of it, which is not needed
            if ( tag.Key!.toLowerCase() === 'name' ) {
                continue
            }

            const existingVolumeTag = volume.Tags?.find( vTag => vTag.Key === tag.Key )

            if ( !existingVolumeTag ) {
                // If the tag is not on the volume, we add it to the tags to apply
                console.log( `Adding tag '${tag.Key}' on volume '${volumeId}' from instance '${instance.InstanceId}'` )
                tagsToApply.push( {
                    Key: tag.Key,
                    Value: tag.Value,
                } )
            } else if ( OVERWRITE_TAGS_ON_VOLUME_FROM_INSTANCE && existingVolumeTag.Value !== tag.Value ) {
                // If the tag is on the volume but has a different value, we overwrite it if overwrite is true
                console.log( `Overwriting tag '${tag.Key}' on volume '${volumeId}' from instance '${instance.InstanceId}'` )
                tagsToApply.push( {
                    Key: tag.Key,
                    Value: tag.Value,
                } )
            } else if ( !OVERWRITE_TAGS_ON_VOLUME_FROM_INSTANCE && existingVolumeTag.Value !== tag.Value ) {
                // If the tag is different and we are not overwriting, we skip it
                console.log( `Skipping tag '${tag.Key}' on volume '${volumeId}' from instance '${instance.InstanceId}' because it already exists with a different value and overwrite is false` )
            }

        }

        if ( tagsToApply.length > 0 ) {

            console.log( `Applying tags to volume '${volumeId}' from instance '${instance.InstanceId}'` )

            if ( DRY_RUN_VOLUMES ) {
                console.log( `DRY RUN: Would apply tags to Volume '${volumeId}:` )
                console.dir( tagsToApply )
                continue
            }

            const command = new CreateTagsCommand( {
                Resources: [ volumeId ],
                Tags: tagsToApply,
            } )

            await ec2Client.send( command )
            console.log( `Tags applied to volume '${volumeId}'` )
        } else {
            console.log( `No tags to apply to volume '${volumeId}' from instance '${instance.InstanceId}'` )
        }
    }
}